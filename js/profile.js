import { auth, db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, Timestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

// Initialize UI elements
const toast = new bootstrap.Toast(document.getElementById('liveToast'));

// Function to format currency to Indian Rupees
const formatCurrencyINR = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// Format date
const formatDate = (date) => {
    return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata'
    });
};

// Show notification toast
const showToast = (message, type = 'info') => {
    const toastElement = document.getElementById('liveToast');
    toastElement.classList.remove('success', 'error');
    toastElement.classList.add(type);
    toastElement.querySelector('.toast-body').textContent = message;
    toast.show();
};

// Format time remaining
const formatTimeRemaining = (endTime) => {
    const now = new Date();
    const end = endTime.toDate();
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push('< 1m');

    return parts.join(' ');
};

// Load user profile
const loadUserProfile = async (userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            showToast('User profile not found', 'error');
            return;
        }

        const userData = userSnap.data();
        document.getElementById('userEmail').textContent = userData.email;
        document.getElementById('username').textContent = `@${userData.username}`;

        // Load active bids
        loadActiveBids(userId, userData.bids || []);
        
        // Load won auctions
        loadWonAuctions(userId);
        
        // Load bid history
        loadBidHistory(userId, userData.bids || []);

    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Error loading profile', 'error');
    }
};

// Load active bids
const loadActiveBids = (userId, userBids) => {
    const now = Timestamp.now();
    const q = query(
        collection(db, 'auctions'),
        where('endTime', '>', now),
        orderBy('endTime')
    );

    onSnapshot(q, (snapshot) => {
        const activeBidsTable = document.getElementById('activeBidsTable');
        const activeBids = [];
        let totalBidValue = 0;

        snapshot.forEach(doc => {
            const auction = doc.data();
            // Check if user has bid on this auction
            if (auction.currentBidder === userId) {
                activeBids.push(auction);
                totalBidValue += auction.currentBid;
            }
        });

        // Update statistics
        document.getElementById('activeBidsCount').textContent = activeBids.length;
        document.getElementById('totalBidsValue').textContent = formatCurrencyINR(totalBidValue);

        // Render active bids table
        activeBidsTable.innerHTML = activeBids.length ? activeBids.map(auction => `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${auction.imageUrl}" alt="${auction.title}" class="me-2" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div class="fw-bold">${auction.title}</div>
                            <small class="text-muted">${auction.description.substring(0, 50)}...</small>
                        </div>
                    </div>
                </td>
                <td>${formatCurrencyINR(auction.currentBid)}</td>
                <td>${formatCurrencyINR(auction.currentBid)}</td>
                <td><span class="badge bg-success">Highest Bidder</span></td>
                <td>${formatTimeRemaining(auction.endTime)}</td>
            </tr>
        `).join('') : '<tr><td colspan="5" class="text-center">No active bids</td></tr>';
    });
};

// Load won auctions
const loadWonAuctions = (userId) => {
    const now = Timestamp.now();
    const q = query(
        collection(db, 'auctions'),
        where('winnerId', '==', userId),
        orderBy('endTime', 'desc')
    );

    onSnapshot(q, (snapshot) => {
        const wonAuctionsTable = document.getElementById('wonAuctionsTable');
        const wonAuctions = snapshot.docs.map(doc => doc.data());

        // Update statistics
        document.getElementById('wonAuctionsCount').textContent = wonAuctions.length;

        // Render won auctions table
        wonAuctionsTable.innerHTML = wonAuctions.length ? wonAuctions.map(auction => `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${auction.imageUrl}" alt="${auction.title}" class="me-2" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div class="fw-bold">${auction.title}</div>
                            <small class="text-muted">${auction.description.substring(0, 50)}...</small>
                        </div>
                    </div>
                </td>
                <td>${formatCurrencyINR(auction.currentBid)}</td>
                <td>${formatDate(auction.endTime.toDate())}</td>
            </tr>
        `).join('') : '<tr><td colspan="3" class="text-center">No won auctions</td></tr>';
    });
};

// Load bid history
const loadBidHistory = async (userId, userBids) => {
    if (!userBids.length) {
        document.getElementById('bidHistoryTable').innerHTML = '<tr><td colspan="4" class="text-center">No bid history</td></tr>';
        return;
    }

    // Get all auctions user has bid on
    const auctionPromises = userBids.map(bid => getDoc(doc(db, 'auctions', bid.auctionId)));
    const auctionDocs = await Promise.all(auctionPromises);
    
    const bidHistoryTable = document.getElementById('bidHistoryTable');
    const now = new Date();

    const bidHistoryHTML = auctionDocs.map((doc, index) => {
        const auction = doc.data();
        const bid = userBids[index];
        const endTime = auction.endTime.toDate();
        const isEnded = endTime <= now;
        
        let status;
        if (!isEnded) {
            status = auction.currentBidder === userId ? 
                '<span class="badge bg-success">Highest Bidder</span>' : 
                '<span class="badge bg-warning text-dark">Outbid</span>';
        } else {
            status = auction.winnerId === userId ? 
                '<span class="badge bg-success">Won</span>' : 
                '<span class="badge bg-danger">Lost</span>';
        }

        return `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${auction.imageUrl}" alt="${auction.title}" class="me-2" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div class="fw-bold">${auction.title}</div>
                            <small class="text-muted">${auction.description.substring(0, 50)}...</small>
                        </div>
                    </div>
                </td>
                <td>${formatCurrencyINR(bid.amount)}</td>
                <td>${formatDate(bid.timestamp.toDate())}</td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');

    bidHistoryTable.innerHTML = bidHistoryHTML;
};

// Check authentication state
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
            document.getElementById('adminBtn').classList.remove('d-none');
        }
        loadUserProfile(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

// Logout handler
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    }).catch((error) => {
        showToast('Error signing out: ' + error.message, 'error');
    });
});
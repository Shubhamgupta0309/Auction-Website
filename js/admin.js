import { auth, db } from './firebase-config.js';
import { doc, getDoc, addDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, Timestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

// Initialize UI elements
const toast = new bootstrap.Toast(document.getElementById('liveToast'));

// Check if user is admin
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const docRef = doc(db, 'admins', user.uid);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Format currency to Indian Rupees
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// Format date
const formatDate = (date) => {
    return new Date(date).toLocaleString('en-IN', {
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

// Update current time
const updateCurrentTime = () => {
    const currentTime = document.getElementById('currentTime');
    currentTime.textContent = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });
};
setInterval(updateCurrentTime, 1000);

// Update statistics
const updateStatistics = (activeAuctions, completedAuctions) => {
    const activeCount = activeAuctions.length;
    const completedCount = completedAuctions.length;
    const biddersSet = new Set();
    let totalBidsValue = 0;

    // Calculate statistics
    [...activeAuctions, ...completedAuctions].forEach(auction => {
        if (auction.currentBidder) {
            biddersSet.add(auction.currentBidder);
        }
        totalBidsValue += auction.currentBid;
    });

    // Animate statistics update
    const animateValue = (element, start, end, duration) => {
        const range = end - start;
        const startTime = performance.now();
        
        const updateValue = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const value = Math.floor(start + (range * progress));
            if (element.id === 'totalBidsValue') {
                element.textContent = formatCurrency(value);
            } else {
                element.textContent = value;
            }
            
            if (progress < 1) {
                requestAnimationFrame(updateValue);
            }
        };
        
        requestAnimationFrame(updateValue);
    };

    // Update statistics with animation
    animateValue(document.getElementById('activeAuctionsCount'), 0, activeCount, 1000);
    animateValue(document.getElementById('completedAuctionsCount'), 0, completedCount, 1000);
    animateValue(document.getElementById('totalBiddersCount'), 0, biddersSet.size, 1000);
    animateValue(document.getElementById('totalBidsValue'), 0, totalBidsValue, 1000);
};

// Create Auction Form Handler
document.getElementById('createAuctionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        if (!auth.currentUser) {
            throw new Error('You must be logged in to create an auction');
        }

        const endTimeStr = document.getElementById('auctionEndTime').value;
        const endTime = new Date(endTimeStr);
        if (endTime <= new Date()) {
            throw new Error('End time must be in the future');
        }

        const startBid = Number(document.getElementById('auctionStartBid').value);
        if (isNaN(startBid) || startBid <= 0) {
            throw new Error('Starting bid must be a positive number');
        }

        const auctionData = {
            title: document.getElementById('auctionTitle').value.trim(),
            description: document.getElementById('auctionDescription').value.trim(),
            imageUrl: document.getElementById('auctionImage').value.trim(),
            startBid: startBid,
            currentBid: startBid,
            endTime: Timestamp.fromDate(endTime),
            createdAt: Timestamp.now(),
            createdBy: auth.currentUser.uid,
            status: 'active',
            currentBidder: null,
            currentBidderEmail: null,
            currentBidderUsername: null,
            winnerId: null,
            winnerEmail: null,
            winnerUsername: null
        };

        // Validate only required fields
        const requiredFields = ['title', 'description', 'imageUrl', 'startBid', 'currentBid', 'endTime', 'createdAt', 'createdBy', 'status'];
        requiredFields.forEach(field => {
            if (auctionData[field] === null || auctionData[field] === undefined || auctionData[field] === '') {
                throw new Error(`${field} is required`);
            }
        });

        await addDoc(collection(db, 'auctions'), auctionData);
        showToast('Auction created successfully!', 'success');
        e.target.reset();
    } catch (error) {
        console.error('Error creating auction:', error);
        showToast(error.message || 'Error creating auction', 'error');
    }
});

// Load Active Auctions with animation
const loadActiveAuctions = () => {
    const now = Timestamp.now();
    
    const q = query(
        collection(db, 'auctions'),
        where('endTime', '>', now),
        orderBy('endTime')
    );
    
    onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('activeAuctionsTable');
        tableBody.innerHTML = '';
        
        snapshot.forEach((doc, index) => {
            const auction = doc.data();
            const row = document.createElement('tr');
            row.style.animation = `fadeIn 0.5s ease-out ${index * 0.1}s both`;
            
            row.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${auction.imageUrl}" alt="${auction.title}" class="me-2" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div class="fw-bold">${auction.title}</div>
                            <small class="text-muted">${auction.description.substring(0, 50)}...</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="fw-bold">${formatCurrency(auction.currentBid)}</div>
                    ${auction.currentBidderUsername ? 
                        `<small class="text-muted">by ${auction.currentBidderUsername}</small>` : 
                        ''}
                </td>
                <td>${formatDate(auction.endTime.toDate())}</td>
                <td>
                    <span class="badge bg-success rounded-pill">Active</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteAuction('${doc.id}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Update statistics for active auctions
        const activeAuctions = snapshot.docs.map(doc => doc.data());
        window.activeAuctionsData = activeAuctions;
        if (window.completedAuctionsData) {
            updateStatistics(activeAuctions, window.completedAuctionsData);
        }
    });
};

// Load Completed Auctions with animation
const loadCompletedAuctions = () => {
    const now = Timestamp.now();
    
    const q = query(
        collection(db, 'auctions'),
        where('endTime', '<=', now),
        orderBy('endTime', 'desc')
    );
    
    onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('completedAuctionsTable');
        tableBody.innerHTML = '';
        
        snapshot.forEach((doc, index) => {
            const auction = doc.data();
            const row = document.createElement('tr');
            row.style.animation = `fadeIn 0.5s ease-out ${index * 0.1}s both`;
            
            row.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${auction.imageUrl}" alt="${auction.title}" class="me-2" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">
                        <div>
                            <div class="fw-bold">${auction.title}</div>
                            <small class="text-muted">${auction.description.substring(0, 50)}...</small>
                        </div>
                    </div>
                </td>
                <td>${formatCurrency(auction.currentBid)}</td>
                <td>${auction.winnerUsername || auction.winnerEmail || 'No bids'}</td>
                <td>${formatDate(auction.endTime.toDate())}</td>
            `;
            tableBody.appendChild(row);
        });

        // Update statistics for completed auctions
        const completedAuctions = snapshot.docs.map(doc => doc.data());
        window.completedAuctionsData = completedAuctions;
        if (window.activeAuctionsData) {
            updateStatistics(window.activeAuctionsData, completedAuctions);
        }
    });
};

// Delete Auction with animation
window.deleteAuction = async (auctionId) => {
    if (!confirm('Are you sure you want to delete this auction?')) return;
    
    try {
        const row = document.querySelector(`[onclick="deleteAuction('${auctionId}')"]`).closest('tr');
        row.style.animation = 'fadeOut 0.3s ease-out forwards';
        
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for animation
        await deleteDoc(doc(db, 'auctions', auctionId));
        showToast('Auction deleted successfully!', 'success');
    } catch (error) {
        showToast('Error deleting auction: ' + error.message, 'error');
    }
};

// Export Completed Auctions
window.exportCompletedAuctions = () => {
    const completedAuctions = window.completedAuctionsData;
    if (!completedAuctions || completedAuctions.length === 0) {
        showToast('No completed auctions to export', 'error');
        return;
    }

    const csvContent = "data:text/csv;charset=utf-8," + 
        "Title,Final Bid,Winner,End Time\n" +
        completedAuctions.map(auction => {
            return `"${auction.title}",${auction.currentBid},"${auction.winnerUsername || auction.winnerEmail || 'No winner'}","${formatDate(auction.endTime.toDate())}"`;
        }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "completed_auctions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export completed successfully!', 'success');
};

// Refresh Active Auctions
window.refreshActiveAuctions = () => {
    const button = document.querySelector('[onclick="refreshActiveAuctions()"] i');
    button.classList.add('fa-spin');
    setTimeout(() => {
        button.classList.remove('fa-spin');
        showToast('Auctions refreshed!', 'success');
    }, 1000);
};

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    });
});

// Load auctions when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadActiveAuctions();
    loadCompletedAuctions();
    updateCurrentTime();
});
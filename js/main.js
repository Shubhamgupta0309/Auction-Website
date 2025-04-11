// Import Firebase modules
import { auth, db } from './firebase-config.js';
import { Timestamp, collection, doc, onSnapshot, query, where, orderBy, runTransaction, arrayUnion, serverTimestamp, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

// Initialize toast notifications
const toast = new bootstrap.Toast(document.getElementById('liveToast'));

// Helper function to format dates
const formatDate = (date) => {
    return new Date(date).toLocaleString();
};

// Helper function to format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Function to format currency to Indian Rupees
const formatCurrencyINR = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// Show notification toast
const showToast = (message, type = 'info') => {
    const toastElement = document.getElementById('liveToast');
    toastElement.classList.remove('success', 'error');
    toastElement.classList.add(type);
    toastElement.querySelector('.toast-body').textContent = message;
    toast.show();
};

// Function to format time remaining
const formatTimeRemaining = (endTime) => {
    const now = new Date();
    const end = endTime.toDate();
    const diff = end - now;

    if (diff <= 0) return 'Auction Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
};

// Function to format time until start
const formatTimeUntilStart = (startTime) => {
    const now = new Date();
    const start = startTime.toDate();
    const diff = start - now;

    if (diff <= 0) return 'Auction Started';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
};

// Update auction timers
const updateTimers = () => {
    document.querySelectorAll('[data-end-time]').forEach(element => {
        const endTime = new Timestamp(
            parseInt(element.dataset.endTime.split(',')[0]),
            parseInt(element.dataset.endTime.split(',')[1])
        );
        const timeLeft = endTime.toDate() - new Date();
        
        if (timeLeft <= 0) {
            // Auction has ended
            const auctionCard = element.closest('.auction-card');
            if (auctionCard) {
                const auctionId = auctionCard.dataset.auctionId;
                handleAuctionEnd(auctionId);
                
                // Add ended class and fade out
                auctionCard.classList.add('ended');
                setTimeout(() => {
                    const parentCol = auctionCard.closest('.col-md-4');
                    if (parentCol) {
                        parentCol.remove();
                    }
                }, 1000);
                
                // Reload auctions to update the lists
                loadActiveAuctions();
                loadPreviousAuctions();
            }
            return;
        }

        element.textContent = formatTimeRemaining(endTime);

        // Add animation when time is running low
        if (timeLeft <= 300000) { // 5 minutes
            element.classList.add('text-danger', 'pulse');
        }
    });
};

// Handle auction end and update winner information
const handleAuctionEnd = async (auctionId) => {
    try {
        const auctionRef = doc(db, 'auctions', auctionId);
        
        await runTransaction(db, async (transaction) => {
            const auctionSnap = await transaction.get(auctionRef);
            if (!auctionSnap.exists()) return;
            
            const auction = auctionSnap.data();
            
            // Check if the auction is already marked as completed
            if (auction.status === 'completed') return;
            
            // If there's a current bidder, they become the winner
            if (auction.currentBidder) {
                // Update auction status and winner info
                transaction.update(auctionRef, {
                    status: 'completed',
                    winnerId: auction.currentBidder,
                    winnerEmail: auction.currentBidderEmail,
                    winnerUsername: auction.currentBidderUsername,
                    completedAt: Timestamp.now()
                });

                // Update winner's profile with won auction
                const winnerRef = doc(db, 'users', auction.currentBidder);
                const winnerSnap = await transaction.get(winnerRef);
                
                if (winnerSnap.exists()) {
                    const wonAuctionData = {
                        auctionId: auctionId,
                        title: auction.title,
                        description: auction.description,
                        imageUrl: auction.imageUrl,
                        finalPrice: auction.currentBid,
                        endTime: auction.endTime,
                        wonAt: Timestamp.now()
                    };
                    
                    transaction.update(winnerRef, {
                        wonAuctions: arrayUnion(wonAuctionData)
                    });
                }
            } else {
                // No bidders, just mark as completed
                transaction.update(auctionRef, {
                    status: 'completed',
                    completedAt: Timestamp.now()
                });
            }
        });

        showToast('Auction completed successfully', 'success');
    } catch (error) {
        console.error('Error handling auction end:', error);
        showToast('Error completing auction: ' + error.message, 'error');
    }
};

// Place bid function
const placeBid = async (auctionId) => {
    try {
        if (!auth.currentUser) {
            showToast('Please login to place a bid', 'error');
            const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            loginModal.show();
            return;
        }

        const auctionRef = doc(db, 'auctions', auctionId);
        const userRef = doc(db, 'users', auth.currentUser.uid);
        
        // Get both auction and user data in parallel
        const [auctionSnap, userSnap] = await Promise.all([
            getDoc(auctionRef),
            getDoc(userRef)
        ]);
        
        if (!auctionSnap.exists()) {
            showToast('Auction not found', 'error');
            return;
        }

        if (!userSnap.exists()) {
            showToast('User profile not found. Please try logging in again', 'error');
            return;
        }

        const auction = auctionSnap.data();

        // Check if auction has ended
        if (auction.endTime.toDate() <= new Date()) {
            showToast('This auction has ended', 'error');
            return;
        }

        // Check if user is trying to bid on their own auction
        if (auction.createdBy === auth.currentUser.uid) {
            showToast('You cannot bid on your own auction', 'error');
            return;
        }

        // Check if user is already the highest bidder
        if (auction.currentBidder === auth.currentUser.uid) {
            showToast('You are already the highest bidder', 'info');
            return;
        }

        const minBid = auction.currentBid + Math.ceil(auction.currentBid * 0.05); // Minimum 5% higher

        // Set auction details in modal
        document.getElementById('auctionDetails').innerHTML = `
            <h6>${auction.title}</h6>
            <p class="mb-2">${auction.description}</p>
            <p class="mb-1">Current Bid: ${formatCurrencyINR(auction.currentBid)}</p>
            <p class="text-muted">Minimum bid: ${formatCurrencyINR(minBid)}</p>
        `;
        document.getElementById('bidAuctionId').value = auctionId;
        document.getElementById('bidAmount').min = minBid;
        document.getElementById('minimumBidText').textContent = `Minimum bid amount: ${formatCurrencyINR(minBid)}`;
        
        // Show bid modal
        const bidModal = new bootstrap.Modal(document.getElementById('bidModal'));
        bidModal.show();
    } catch (error) {
        console.error('Error showing bid modal:', error);
        showToast('Error preparing bid form: ' + error.message, 'error');
    }
};

// Handle bid form submission
document.getElementById('bidForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const auctionId = document.getElementById('bidAuctionId').value;
        const bidInput = document.getElementById('bidAmount');
        
        // Parse bid amount, removing commas and converting to number
        let bidAmount;
        try {
            // Remove all commas and convert to number
            bidAmount = Number(bidInput.value.replace(/,/g, ''));
            
            // Validate the bid amount
            if (isNaN(bidAmount)) {
                throw new Error('Please enter a valid number');
            }
            
            if (bidAmount <= 0) {
                throw new Error('Bid amount must be greater than 0');
            }
            
            if (bidAmount >= 1000000000000) { // 1 trillion limit
                throw new Error('Bid amount is too large');
            }
            
            // Round to 2 decimal places to avoid floating point issues
            bidAmount = Math.round(bidAmount * 100) / 100;
            
        } catch (error) {
            bidInput.classList.add('is-invalid');
            throw new Error('Invalid bid amount: ' + error.message);
        }

        if (!auth.currentUser) {
            showToast('You must be logged in to bid', 'error');
            return;
        }

        const auctionRef = doc(db, 'auctions', auctionId);
        const userRef = doc(db, 'users', auth.currentUser.uid);
        
        await runTransaction(db, async (transaction) => {
            // Get latest auction and user data inside transaction
            const [auctionSnap, userSnap] = await Promise.all([
                transaction.get(auctionRef),
                transaction.get(userRef)
            ]);

            if (!auctionSnap.exists()) {
                throw new Error('Auction not found');
            }

            if (!userSnap.exists()) {
                throw new Error('User profile not found');
            }

            const auction = auctionSnap.data();
            const user = userSnap.data();

            // Validate auction is still active
            if (auction.endTime.toDate() <= new Date()) {
                throw new Error('This auction has ended');
            }

            // Prevent bidding on own auction
            if (auction.createdBy === auth.currentUser.uid) {
                throw new Error('You cannot bid on your own auction');
            }

            // Prevent duplicate highest bidder
            if (auction.currentBidder === auth.currentUser.uid) {
                throw new Error('You are already the highest bidder');
            }

            // Calculate minimum bid with proper number handling
            const minBid = auction.currentBid + Math.ceil(auction.currentBid * 0.05);
            if (bidAmount < minBid) {
                throw new Error(`Bid must be at least ${formatCurrencyINR(minBid)}`);
            }

            // Create bid record
            const bidData = {
                auctionId,
                amount: bidAmount,
                timestamp: Timestamp.now(),
                auctionTitle: auction.title
            };

            // Update auction with new bid
            transaction.update(auctionRef, {
                currentBid: bidAmount,
                currentBidder: auth.currentUser.uid,
                currentBidderEmail: user.email,
                currentBidderUsername: user.username,
                lastBidTime: Timestamp.now()
            });

            // Add bid to user's bids array
            transaction.update(userRef, {
                bids: arrayUnion(bidData)
            });
        });

        // Reset validation styles
        bidInput.classList.remove('is-invalid');
        bidInput.classList.add('is-valid');

        // Close modal and show success message
        const bidModal = bootstrap.Modal.getInstance(document.getElementById('bidModal'));
        bidModal.hide();
        showToast('Bid placed successfully!', 'success');
        
    } catch (error) {
        console.error('Error placing bid:', error);
        showToast(error.message || 'Error placing bid', 'error');
    }
});

// Format input as Indian number system with improved validation
document.getElementById('bidAmount')?.addEventListener('input', function(e) {
    const input = e.target;
    let value = input.value.replace(/[^0-9.]/g, ''); // Remove all non-numeric characters except decimal
    
    // Handle decimal points
    const parts = value.split('.');
    if (parts.length > 2) {
        // More than one decimal point - keep only first one
        value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit decimal places to 2
    if (parts.length === 2) {
        value = parts[0] + '.' + parts[1].slice(0, 2);
    }
    
    // Format the whole number part
    if (parts[0].length > 0) {
        // Convert to Indian number format
        let lastThree = parts[0].substring(parts[0].length - 3);
        let otherNumbers = parts[0].substring(0, parts[0].length - 3);
        if (otherNumbers !== '') {
            lastThree = ',' + lastThree;
        }
        let formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
        
        // Add back decimal part if it exists
        if (parts.length === 2) {
            formatted += '.' + parts[1];
        }
        
        value = formatted;
    }
    
    // Update input value
    input.value = value;
    
    // Validate input
    const numericValue = Number(value.replace(/,/g, ''));
    if (isNaN(numericValue) || numericValue <= 0) {
        input.classList.add('is-invalid');
        input.classList.remove('is-valid');
    } else {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
    }
});

// Add placeBid to window object so it can be called from HTML
window.placeBid = placeBid;

// Show login prompt only when needed
window.showLoginPrompt = () => {
    if (!auth.currentUser) {
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
    }
};

// Render auction button based on auth state
const renderAuctionButton = (auctionId) => {
    if (auth.currentUser) {
        return `<button class="btn btn-primary" onclick="placeBid('${auctionId}')" data-auction-id="${auctionId}">
            Place Bid
        </button>`;
    } else {
        return `<button class="btn btn-primary" onclick="showLoginPrompt()" data-auction-id="${auctionId}">
            Login to Bid
        </button>`;
    }
};

// Load active auctions with updated button handling
async function loadActiveAuctions() {
    try {
        const now = Timestamp.now();
        const q = query(
            collection(db, 'auctions'),
            where('endTime', '>', now),
            orderBy('endTime', 'asc')
        );

        onSnapshot(q, (snapshot) => {
            const container = document.getElementById('activeAuctionsList');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="empty-state-card text-center">
                            <div class="empty-state-illustration">
                                <i class="fas fa-box-open fa-4x mb-4"></i>
                            </div>
                            <h3 class="mb-3">No Active Auctions</h3>
                            <p class="mb-4">There are no active auctions at the moment. Check back soon for new items!</p>
                            <div class="cta-buttons">
                                <a href="#how-it-works" class="btn btn-primary me-3">
                                    <i class="fas fa-info-circle me-2"></i>Learn More
                                </a>
                                <button class="btn btn-outline-primary" onclick="showLoginPrompt()">
                                    <i class="fas fa-bell me-2"></i>Get Notified
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach((doc) => {
                const auction = doc.data();
                const endTime = auction.endTime.toDate();
                const now = new Date();
                
                // Check if auction has ended
                if (endTime <= now) {
                    updateDoc(doc.ref, {
                        status: 'completed'
                    }).then(() => {
                        loadPreviousAuctions();
                    });
                    return;
                }

                const card = document.createElement('div');
                card.className = 'col-md-4 mb-4';
                
                card.innerHTML = `
                    <div class="auction-card" data-auction-id="${doc.id}">
                        <img src="${auction.imageUrl}" class="auction-image w-100" alt="${auction.title}">
                        <div class="card-body">
                            <h5 class="card-title">${auction.title}</h5>
                            <p class="card-text">${auction.description}</p>
                            <p class="current-bid">Current Bid: ${formatCurrencyINR(auction.currentBid)}</p>
                            <p class="auction-timer" data-end-time="${auction.endTime.seconds},${auction.endTime.nanoseconds}">
                                ${formatTimeRemaining(auction.endTime)}
                            </p>
                            ${renderAuctionButton(doc.id)}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });

            // Update timers for new cards
            updateTimers();
        });
    } catch (error) {
        console.error("Error loading auctions:", error);
        showToast("Error loading auctions", "error");
    }
}

// Load upcoming auctions
async function loadUpcomingAuctions() {
    try {
        const now = Timestamp.now();
        const q = query(
            collection(db, 'auctions'),
            where('startTime', '>', now),
            orderBy('startTime')
        );

        onSnapshot(q, (snapshot) => {
            const container = document.getElementById('upcomingAuctionsList');
            container.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const auction = doc.data();
                const card = document.createElement('div');
                card.className = 'col-md-4 mb-4';
                card.innerHTML = `
                    <div class="auction-card">
                        <img src="${auction.imageUrl}" class="auction-image w-100" alt="${auction.title}">
                        <div class="card-body">
                            <h5 class="card-title">${auction.title}</h5>
                            <p class="card-text">${auction.description}</p>
                            <p class="starting-bid">Starting Bid: ${formatCurrencyINR(auction.startBid)}</p>
                            <p>Starts: ${formatDate(auction.startTime.toDate())}</p>
                            <button class="btn btn-secondary notify-btn" onclick="showLoginPrompt()">
                                Notify Me
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    } catch (error) {
        console.error("Error loading upcoming auctions:", error);
        showToast("Error loading auctions", "error");
    }
}

// Load previous auctions
async function loadPreviousAuctions() {
    try {
        const now = Timestamp.now();
        const q = query(
            collection(db, 'auctions'),
            where('endTime', '<=', now),
            orderBy('endTime', 'desc')
        );

        onSnapshot(q, (snapshot) => {
            const container = document.getElementById('previousAuctionsList');
            container.innerHTML = '';
            
            snapshot.forEach((doc) => {
                const auction = doc.data();
                const card = document.createElement('div');
                card.className = 'col-md-4 mb-4';
                card.innerHTML = `
                    <div class="auction-card">
                        <div class="winner-badge">Sold!</div>
                        <img src="${auction.imageUrl}" class="auction-image w-100" alt="${auction.title}">
                        <div class="card-body">
                            <h5 class="card-title">${auction.title}</h5>
                            <p class="card-text">${auction.description}</p>
                            <p class="final-bid">Final Price: ${formatCurrencyINR(auction.currentBid)}</p>
                            <p>Winner: ${auction.winnerUsername || 'No Winner'}</p>
                            <p>Ended: ${formatDate(auction.endTime.toDate())}</p>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    } catch (error) {
        console.error("Error loading previous auctions:", error);
        showToast("Error loading auctions", "error");
    }
}

// Update featured auction with auth-aware button
async function loadFeaturedAuction() {
    try {
        const now = Timestamp.now();
        const q = query(
            collection(db, 'auctions'),
            where('endTime', '>', now),
            orderBy('endTime')
        );

        onSnapshot(q, (snapshot) => {
            const featuredContainer = document.getElementById('featuredAuction');
            if (!featuredContainer) return;

            const doc = snapshot.docs[0]; // Get the first auction
            if (doc) {
                const auction = doc.data();
                featuredContainer.classList.remove('shimmer');
                featuredContainer.innerHTML = `
                    <div class="featured-auction-content">
                        <img src="${auction.imageUrl}" class="img-fluid rounded mb-3" alt="${auction.title}">
                        <h4>${auction.title}</h4>
                        <p class="text-white-50">${auction.description}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="current-bid text-white">
                                Current Bid: ${formatCurrencyINR(auction.currentBid)}
                            </div>
                            <div class="time-remaining text-white">
                                <i class="fas fa-clock me-2"></i>
                                <span data-end-time="${auction.endTime.seconds},${auction.endTime.nanoseconds}">
                                    ${formatTimeRemaining(auction.endTime)}
                                </span>
                            </div>
                        </div>
                        ${renderAuctionButton(doc.id)}
                    </div>
                `;
            } else {
                featuredContainer.innerHTML = '<p class="text-white">No active auctions available</p>';
            }
        });
    } catch (error) {
        console.error("Error loading featured auction:", error);
        showToast("Error loading featured auction", "error");
    }
}

// Load statistics
function loadStatistics() {
    try {
        const now = Timestamp.now();
        
        // Query for active auctions
        const activeQuery = query(
            collection(db, 'auctions'),
            where('endTime', '>', now),
            where('startTime', '<=', now)
        );

        // Query for completed auctions
        const completedQuery = query(
            collection(db, 'auctions'),
            where('endTime', '<=', now)
        );

        // Listen for active auctions count
        onSnapshot(activeQuery, (snapshot) => {
            document.getElementById('activeAuctionsCount').textContent = snapshot.size;
        });

        // Listen for completed auctions count
        onSnapshot(completedQuery, (snapshot) => {
            document.getElementById('completedAuctionsCount').textContent = snapshot.size;
        });

        // Listen for total users count
        onSnapshot(collection(db, 'users'), (snapshot) => {
            document.getElementById('totalUsersCount').textContent = snapshot.size;
        });

    } catch (error) {
        console.error("Error loading statistics:", error);
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadFeaturedAuction();
    loadActiveAuctions();
    loadPreviousAuctions();
    loadStatistics();
});

// Logout handler
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        showToast('Error signing out: ' + error.message, 'error');
    });
});

// Auth state observer
auth.onAuthStateChanged((user) => {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const profileBtn = document.getElementById('profileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminBtn = document.getElementById('adminBtn');

    if (user) {
        loginBtn?.classList.add('d-none');
        registerBtn?.classList.add('d-none');
        profileBtn?.classList.remove('d-none');
        logoutBtn?.classList.remove('d-none');

        // Check if user is admin
        getDoc(doc(db, 'admins', user.uid))
            .then((docSnap) => {
                if (docSnap.exists() && adminBtn) {
                    adminBtn.classList.remove('d-none');
                }
            });
    } else {
        loginBtn?.classList.remove('d-none');
        registerBtn?.classList.remove('d-none');
        profileBtn?.classList.add('d-none');
        logoutBtn?.classList.add('d-none');
        adminBtn?.classList.add('d-none');
    }
});
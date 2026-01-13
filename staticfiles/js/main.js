// main.js - Global JavaScript functionality
document.addEventListener('DOMContentLoaded', function() {
    console.log('Global scripts loaded - Debug: Mobile menu fix');
    
    // Mobile menu toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mainNav = document.querySelector('.main-nav');
    
    console.log('Mobile menu elements:', {
        toggle: mobileMenuToggle,
        nav: mainNav
    });
    
    if (mobileMenuToggle && mainNav) {
        // Click handler for mobile menu toggle
        mobileMenuToggle.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent event bubbling
            
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !isExpanded);
            mainNav.classList.toggle('active');
            
            // Change icon
            const icon = this.querySelector('i');
            if (icon) {
                if (mainNav.classList.contains('active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                    document.body.style.overflow = 'hidden'; // Prevent scrolling
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                    document.body.style.overflow = ''; // Restore scrolling
                }
            }
            
            console.log('Mobile menu toggled. Active:', mainNav.classList.contains('active'));
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (mainNav.classList.contains('active') && 
                !mainNav.contains(event.target) && 
                !mobileMenuToggle.contains(event.target)) {
                
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                mainNav.classList.remove('active');
                
                const icon = mobileMenuToggle.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
                
                document.body.style.overflow = ''; // Restore scrolling
                console.log('Mobile menu closed (clicked outside)');
            }
        });
        
        // Close menu when clicking a link
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                if (mainNav.classList.contains('active')) {
                    mobileMenuToggle.setAttribute('aria-expanded', 'false');
                    mainNav.classList.remove('active');
                    
                    const icon = mobileMenuToggle.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-times');
                        icon.classList.add('fa-bars');
                    }
                    
                    document.body.style.overflow = ''; // Restore scrolling
                    console.log('Mobile menu closed (link clicked)');
                }
            });
        });
        
        // Close menu on window resize (if resizing to desktop)
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && mainNav.classList.contains('active')) {
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                mainNav.classList.remove('active');
                
                const icon = mobileMenuToggle.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
                
                document.body.style.overflow = ''; // Restore scrolling
                console.log('Mobile menu closed (window resized)');
            }
        });
    } else {
        console.error('Mobile menu elements not found! Check your HTML structure.');
    }
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const headerHeight = document.querySelector('.main-header')?.offsetHeight || 80;
                const targetPosition = targetElement.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Add active class to current page in navigation
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-links a');
    
    navItems.forEach(item => {
        const itemPath = item.getAttribute('href');
        // Remove trailing slashes for comparison
        const cleanCurrentPath = currentPath.replace(/\/$/, '');
        const cleanItemPath = itemPath.replace(/\/$/, '');
        
        if (cleanCurrentPath === cleanItemPath || 
            (cleanCurrentPath.includes(cleanItemPath) && cleanItemPath !== '')) {
            item.classList.add('active');
        }
    });
    
    // Add loading indicator for all pages
    window.addEventListener('load', function() {
        console.log('Page fully loaded');
        // Remove any loading states if needed
        const loadingElements = document.querySelectorAll('.loading');
        loadingElements.forEach(el => el.classList.remove('loading'));
    });
});
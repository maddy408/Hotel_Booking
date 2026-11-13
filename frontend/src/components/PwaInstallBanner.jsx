import { useState, useEffect } from 'react';
import './PwaInstallBanner.css';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (PWA installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed it in this session
    const isDismissed = sessionStorage.getItem('tc_pwa_dismissed');
    if (isDismissed) {
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Also support custom fallback banner if not fired after 2 seconds for non-Chrome or desktop browsers
    const timer = setTimeout(() => {
      if (!isStandalone && !sessionStorage.getItem('tc_pwa_dismissed')) {
        setIsVisible(true);
      }
    }, 1500);

    const handleAppInstalled = () => {
      setIsVisible(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsVisible(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback instruction for browsers like iOS Safari or desktop Chrome when prompt event already passed
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIos) {
        alert("To install Tamarind Court app: Tap the 'Share' icon (square with arrow) at the bottom and choose 'Add to Home Screen'.");
      } else {
        alert("To install: Open browser menu (⋮ or top right) and select 'Install Tamarind Court' or 'Add to Home Screen'.");
      }
      setIsVisible(false);
      sessionStorage.setItem('tc_pwa_dismissed', '1');
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    sessionStorage.setItem('tc_pwa_dismissed', '1');
  };

  if (!isVisible || isInstalled) {
    return null;
  }

  return (
    <div className="pwa-install-banner" role="banner" aria-label="Install App Banner">
      <div className="pwa-banner-content">
        <div className="pwa-banner-left">
          <svg className="pwa-download-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="pwa-banner-text">Install Tamarind Court App on your Home Screen!</span>
        </div>
        <div className="pwa-banner-actions">
          <button type="button" className="pwa-btn-close" onClick={handleClose}>
            Close
          </button>
          <button type="button" className="pwa-btn-install" onClick={handleInstallClick}>
            Install App
          </button>
        </div>
      </div>
    </div>
  );
}

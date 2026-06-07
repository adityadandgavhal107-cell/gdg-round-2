import React, { useState } from 'react';

export default function LoginPortal({ onAdminLoginSuccess }) {
  const [loginType, setLoginType] = useState(null); // 'admin' | 'guest'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Triggered when an operator clicks the DAF option button matrix
  const handleDafDirectNavigation = () => {
    // Shifts window location space directly to your compiled daf entry asset bundle
    window.location.href = '/daf.html';
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please fill in all secure clearance fields.');
      return;
    }

    // --- COMMAND ADMIN LAYER AUTH ---
    if (loginType === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        onAdminLoginSuccess();
      } else {
        setError('Invalid Administrative Credentials.');
      }
    } 
    
    // --- GUEST FASTAPI + SQLALCHEMY INTERFACE ---
    else if (loginType === 'guest') {
      setIsLoading(true);
      try {
        const response = await fetch('/api/v1/auth/guest-login', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            login_id: username.trim(), // Expects: First Name
            password: password.trim()   // Expects: First 3 letters + Room Number
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          window.location.href = '/guest.html';
        } else {
          setError(data.message || 'Authentication failed. Verify names and room configurations.');
        }
      } catch (err) {
        console.error('FastAPI Connection Timeout:', err);
        setError('Unable to reach the centralized verification matrix.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div style={styles.portalContainer}>
      {/* Calm, Non-Scary Ambient Moving Fire-Ember Particles */}
      <div style={styles.ambientOverlay}>
        {[...Array(20)].map((_, i) => (
          <span 
            key={i} 
            className="moving-ember"
            style={{
              ...styles.ember,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 5}s`,
            }} 
          />
        ))}
      </div>

      {/* Global CSS Injector Rule for Keyframe Animations */}
      <style>{`
        @keyframes subtleFloatUp {
          0% { transform: translateY(110vh) scale(0.8); opacity: 0; }
          20% { opacity: 0.35; }
          80% { opacity: 0.15; }
          100% { transform: translateY(-10vh) scale(0.3); opacity: 0; }
        }
        .moving-ember {
          animation: subtleFloatUp linear infinite;
        }
      `}</style>

      {/* Premium Glassmorphic Card Housing */}
      <div style={styles.glassCard}>
        
        {/* Universal Branding Header (Common to all roles) */}
        <div style={styles.brandingBox}>
          <div style={styles.logo}>🔥</div>
          <h1 style={styles.mainTitle}>FireGuard <span style={styles.redSpan}>HMS</span></h1>
          <p style={styles.mottoText}>
            Intelligent Emergency Infrastructure & Real-Time Life Safety Management.
          </p>
        </div>

        {/* PHASE 1: STANDARD ROLE SELECTOR WINDOW */}
        {!loginType ? (
          <div>
            <h3 style={styles.sectionHeader}>Select Portal Clearance Vector</h3>
            <div style={styles.buttonStack}>
              <button style={styles.roleBtn} onClick={() => setLoginType('admin')}>
                <span style={styles.btnIcon}>🛡️</span>
                <span style={styles.btnLabel}>Command Admin</span>
              </button>

              <button style={styles.roleBtn} onClick={() => setLoginType('guest')}>
                <span style={styles.btnIcon}>🏨</span>
                <span style={styles.btnLabel}>Hotel Guest Portal</span>
              </button>

              {/* DAF Button directly switches view pathing instantly */}
              <button style={{...styles.roleBtn, borderColor: 'rgba(255, 59, 48, 0.3)'}} onClick={handleDafDirectNavigation}>
                <span style={styles.btnIcon}>🚒</span>
                <span style={styles.btnLabel}>DAF Tactical Team</span>
              </button>
            </div>
          </div>
        ) : (
          
          /* PHASE 2: CREDENTIAL VERIFICATION FORMS (ADMIN / GUEST) */
          <form onSubmit={handleFormSubmit}>
            <div style={styles.navRow}>
              <button type="button" style={styles.backBtn} onClick={() => { setLoginType(null); setError(''); }}>
                ← Change Role
              </button>
              <span style={styles.badge}>
                {loginType === 'admin' ? '🛡️ Admin Block' : '🏨 Guest Track'}
              </span>
            </div>

            <h3 style={styles.formTitle}>Secure Authentication Entry</h3>

            {error && <div style={styles.errorBox}>⚠️ {error}</div>}

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                {loginType === 'guest' ? 'First Name' : 'Login ID'}
              </label>
              <input 
                type="text"
                required
                style={styles.input}
                placeholder={loginType === 'guest' ? "e.g., Arjun" : "Enter ID"}
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                {loginType === 'guest' ? 'Passcode (First 3 letters + Room #)' : 'Password'}
              </label>
              <input 
                type="password"
                required
                style={styles.input}
                placeholder={loginType === 'guest' ? "e.g., Arj101" : "••••••••"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button type="submit" style={styles.submitBtn} disabled={isLoading}>
              {isLoading ? 'Verifying Node Access...' : 'Login'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// INLINE JAVASCRIPT STYLE DICTIONARY (Keeps build completely uniform)
// ==========================================================================
const styles = {
  portalContainer: {
    position: 'fixed',
    top: 0, left: 0,
    width: '100vw', height: '100vh',
    background: '#0b0c10', // Dark obsidian space matching dashboard mockups
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', zIndex: 999999,
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  ambientOverlay: {
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: '100%',
    background: 'radial-gradient(circle at 50% 90%, rgba(255, 69, 0, 0.07) 0%, transparent 65%)',
    pointerEvents: 'none'
  },
  ember: {
    position: 'absolute',
    bottom: '-10px',
    width: '5px', height: '5px',
    background: 'linear-gradient(135deg, #ff4d4d, #ff9f43)',
    borderRadius: '50%',
    filter: 'blur(0.5px)'
  },
  glassCard: {
    width: '100%', maxWidth: '420px',
    padding: '40px',
    background: 'rgba(20, 22, 30, 0.8)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)'
  },
  brandingBox: {
    textAlign: 'center',
    marginBottom: '32px'
  },
  logo: {
    fontSize: '44px',
    marginBottom: '8px',
    filter: 'drop-shadow(0 4px 10px rgba(255, 77, 77, 0.35))'
  },
  mainTitle: {
    fontSize: '28px', color: '#ffffff',
    fontWeight: '800', margin: 0, letterSpacing: '-0.5px'
  },
  redSpan: { color: '#ff4d4d' },
  mottoText: {
    fontSize: '13px', color: '#a0aec0',
    lineHeight: '1.5', marginTop: '10px', fontWeight: '400'
  },
  sectionHeader: {
    fontSize: '11px', color: '#718096',
    textTransform: 'uppercase', letterSpacing: '1.5px',
    textAlign: 'center', marginBottom: '20px'
  },
  buttonStack: {
    display: 'flex', flexDirection: 'column', gap: '12px'
  },
  roleBtn: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '16px 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: '10px', color: '#ffffff',
    cursor: 'pointer', textAlign: 'left',
    transition: 'transform 0.2s ease, background 0.2s ease'
  },
  btnIcon: { fontSize: '20px' },
  btnLabel: { fontSize: '14px', fontWeight: '600' },
  navRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '24px'
  },
  backBtn: {
    background: 'none', border: 'none',
    color: '#718096', fontSize: '12px', cursor: 'pointer'
  },
  badge: {
    fontSize: '10px', background: 'rgba(255, 77, 77, 0.15)',
    color: '#ff4d4d', padding: '4px 10px', borderRadius: '20px',
    fontWeight: '700', letterSpacing: '0.5px'
  },
  formTitle: {
    fontSize: '18px', color: '#ffffff',
    fontWeight: '700', marginBottom: '20px'
  },
  errorBox: {
    background: 'rgba(245, 101, 101, 0.15)', border: '1px solid rgba(245, 101, 101, 0.2)',
    color: '#feb2b2', padding: '10px 14px', borderRadius: '6px',
    fontSize: '12px', marginBottom: '18px'
  },
  inputGroup: { marginBottom: '18px' },
  label: {
    display: 'block', fontSize: '11px', color: '#a0aec0',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'
  },
  input: {
    width: '100%', padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px', color: '#ffffff', fontSize: '14px'
  },
  submitBtn: {
    width: '100%', padding: '14px',
    background: '#ff4d4d', border: 'none', borderRadius: '8px',
    color: '#ffffff', fontSize: '14px', fontWeight: '700',
    cursor: 'pointer', marginTop: '10px'
  }
};
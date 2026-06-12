// src/components/LanguagePicker.jsx
import { useEffect, useState } from 'react';
import { voiceAssistant } from '../core/VoiceAssistant';

export default function LanguagePicker({ onSelect }) {
  const [available, setAvailable] = useState([]);

  useEffect(() => {
    voiceAssistant.getAvailableLanguages().then(setAvailable);

    // Auto-select after 8 seconds — don't make a panicking guest wait
    const timer = setTimeout(() => onSelect('en-IN'), 8000);
    return () => clearTimeout(timer);
  }, [onSelect]);

  return (
    <div style={{
      background: '#111',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
      fontFamily: 'Inter, sans-serif'
    }}>
      <p style={{ color: '#fff', fontSize: 18, marginBottom: 8, textAlign: 'center', fontWeight: 700 }}>
        Select your language / अपनी भाषा चुनें
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 360 }}>
        {available.map(l => (
          <button
            key={l.code}
            onClick={() => onSelect(l.code)}
            disabled={!l.available}
            style={{
              padding: '14px 8px',
              borderRadius: 10,
              border: 'none',
              background: l.available ? '#00C853' : '#333',
              color: l.available ? '#fff' : '#666',
              fontSize: 15,
              cursor: l.available ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              fontWeight: 700
            }}
          >
            <span style={{ fontSize: 22 }}>{l.flag}</span>
            <span>{l.label}</span>
            {!l.available && <span style={{ fontSize: 11, fontWeight: 400 }}>unavailable</span>}
          </button>
        ))}
      </div>
      <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
        Auto-selecting English in a few seconds...
      </p>
    </div>
  );
}
import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   LandingPage.jsx  —  fixed authentication & navigation
   Props:
     onAdminAuthSuccess    () => void
     onGuestAuthSuccess    () => void
     onDafAuthSuccess      () => void
───────────────────────────────────────────────────────────────────────── */

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

  .fg-root *, .fg-root *::before, .fg-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .fg-root {
    font-family: 'JetBrains Mono', monospace;
    background-color: #131314;
    color: #e3e3e3;
    min-height: 100vh;
    overflow-x: hidden;
    overflow-y: auto;
    position: relative;
  }

  .fg-root ::selection { background: rgba(0,210,255,0.3); }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    font-family: 'Material Symbols Outlined';
    font-style: normal;
    line-height: 1;
    display: inline-block;
    text-transform: none;
    letter-spacing: normal;
    word-wrap: normal;
    white-space: nowrap;
    direction: ltr;
    -webkit-font-smoothing: antialiased;
    vertical-align: middle;
  }

  .fg-canvas {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0; pointer-events: none; opacity: 0.35;
  }

  .glass-card {
    background: rgba(33, 32, 33, 0.6);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
  }
  .glass-card:hover {
    border: 1px solid rgba(0, 210, 255, 0.3);
    box-shadow: 0 0 20px rgba(0, 210, 255, 0.1);
  }

  .hero-gradient {
    background: radial-gradient(circle at 50% 50%, rgba(0, 210, 255, 0.08) 0%, transparent 80%);
  }

  .glow-accent {
    box-shadow: 0 0 15px rgba(0, 210, 255, 0.3);
  }

  .input-dark {
    background: #ffffff;
    border: 1px solid #444746;
    color: #000000;
  }
  .input-dark:focus {
    outline: none;
    border-color: #00d2ff;
    box-shadow: 0 0 0 2px rgba(0, 210, 255, 0.15);
  }

  @keyframes pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 5px #ff4d4d) saturate(1.5); color: #ff4d4d; }
    50%       { filter: drop-shadow(0 0 15px #ff8c00) saturate(2);  color: #ff8c00; }
  }
  .pulse-glow { animation: pulse-glow 2s infinite ease-in-out; }

  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .reveal { opacity: 0; transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
  .reveal.visible {
    opacity: 1;
    transform: translateY(0);
    animation: fade-in-up 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none;
    transition: opacity 0.3s ease;
  }
  .modal-overlay.open { opacity: 1; pointer-events: all; }
  .modal-box {
    background: #1c1b1c;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 1.25rem;
    padding: 2.5rem;
    max-width: 420px; width: 90%;
    transform: translateY(24px);
    transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
    box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  }
  .modal-overlay.open .modal-box { transform: translateY(0); }

  .fg-toast {
    position: fixed; bottom: 2rem; left: 50%;
    transform: translateX(-50%) translateY(100px);
    z-index: 300; min-width: 280px; text-align: center;
    padding: 1rem 1.5rem; border-radius: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; letter-spacing: 0.06em; font-weight: 600;
    transition: transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s;
    opacity: 0; pointer-events: none;
  }
  .fg-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  .fg-toast.success { background: #004a77; color: #00d2ff; border: 1px solid rgba(0,210,255,0.3); }
  .fg-toast.error   { background: #410002; color: #ffb4ab; border: 1px solid rgba(255,180,171,0.3); }

  .spinner {
    display: inline-block; width: 18px; height: 18px;
    border: 2px solid rgba(0,210,255,0.3);
    border-top-color: #00d2ff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle; margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .field-error {
    color: #ffb4ab; font-size: 11px; letter-spacing: 0.06em;
    margin-top: 4px; display: none;
  }
  .field-error.show { display: block; }

  .fg-header {
    position: fixed; top: 0; width: 100%; z-index: 50;
    background: rgba(19,19,20,0.90);
    backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 2rem; height: 80px;
  }
  .fg-header-left { display: flex; align-items: center; gap: 1rem; }
  .fg-logo-word {
    font-weight: 900; letter-spacing: 0.25em;
    color: #00d2ff; font-size: 18px;
    font-family: 'JetBrains Mono', monospace;
  }
  .fg-logo-sub {
    color: #444746;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; letter-spacing: 0.3em; font-weight: 600;
  }
  .fg-header-right { display: flex; align-items: center; gap: 2.5rem; }
  @media (max-width: 767px) { .fg-header-right { display: none; } }

  .fg-nav { display: flex; align-items: center; gap: 2rem; }
  .fg-nav-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; letter-spacing: 0.2em;
    text-decoration: none; color: rgba(196,199,197,1); font-weight: 500;
    transition: color 0.2s ease; padding: 4px 8px;
  }
  .fg-nav-link:hover { color: #00d2ff; }
  .fg-nav-link.active {
    color: #00d2ff; font-weight: 700;
    border-bottom: 2px solid #00d2ff; padding-bottom: 4px;
  }
  .fg-status-pill {
    display: flex; align-items: center; gap: 0.75rem;
    background: rgba(0,210,255,0.10);
    padding: 10px 20px;
    border-radius: 9999px;
    border: 1px solid rgba(0,210,255,0.20);
    box-shadow: 0 0 15px rgba(0,210,255,0.3);
  }
  .fg-status-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #00d2ff;
    animation: animate-pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite;
  }
  @keyframes animate-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .fg-status-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.2em; font-weight: 700;
    color: #00d2ff; text-transform: uppercase;
  }

  .fg-main {
    padding-top: 8rem; padding-bottom: 5rem;
    padding-left: 1rem; padding-right: 1rem;
    max-width: 80rem; margin: 0 auto;
    display: flex; flex-direction: column; gap: 6rem;
    position: relative; z-index: 10;
  }
  @media (min-width: 768px) {
    .fg-main { padding-left: 2rem; padding-right: 2rem; }
  }

  .fg-hero {
    position: relative;
    padding: 4rem 2rem;
    text-align: center;
    border-radius: 1.5rem;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.05);
    background-color: rgba(28,27,28,0.30);
  }
  @media (min-width: 768px) {
    .fg-hero { padding: 8rem 2rem; }
  }
  .fg-hero-inner {
    position: relative; z-index: 10;
    display: flex; flex-direction: column; gap: 2rem;
    max-width: 64rem; margin: 0 auto;
    padding: 0 2rem;
  }
  .fg-hero-badge {
    display: inline-flex; align-items: center; gap: 0.75rem;
    padding: 8px 20px; border-radius: 9999px;
    background: rgba(0,210,255,0.10); border: 1px solid rgba(0,210,255,0.20);
    color: #00d2ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; letter-spacing: 0.2em;
    margin-bottom: 1rem;
  }
  .fg-hero h1 {
    font-family: 'Inter', sans-serif;
    font-size: clamp(36px, 5vw, 56px);
    letter-spacing: -0.03em; line-height: 1.1; font-weight: 800;
    color: #e3e3e3;
  }
  @media (min-width: 768px) {
    .fg-hero h1 { font-size: clamp(48px, 7vw, 72px); }
  }
  .fg-hero h1 .text-primary {
    color: #00d2ff;
    filter: drop-shadow(0 0 10px rgba(0,210,255,0.4));
  }
  .fg-hero p {
    font-family: 'Inter', sans-serif;
    font-size: 20px; line-height: 1.7; font-weight: 400;
    color: rgba(196,199,197,1);
    max-width: 48rem; margin: 0 auto;
  }
  @media (min-width: 768px) {
    .fg-hero p { font-size: 24px; }
  }

  .fg-features { display: flex; flex-direction: column; gap: 2.5rem; }
  .fg-section-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    padding: 0 8px;
  }
  .fg-section-header-left { display: flex; flex-direction: column; gap: 8px; }
  .fg-section-header h2 {
    font-family: 'Inter', sans-serif;
    font-size: 36px; line-height: 44px; font-weight: 900;
    color: #e3e3e3; text-transform: uppercase; letter-spacing: -0.01em;
  }
  .fg-section-header p {
    font-family: 'Inter', sans-serif;
    font-size: 18px; line-height: 24px; font-weight: 400;
    color: rgba(196,199,197,1);
  }
  .fg-view-all {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; font-weight: 700; color: #00d2ff;
    border-bottom: 2px solid rgba(0,210,255,0.30); padding-bottom: 4px;
    text-decoration: none; letter-spacing: 0.2em;
    transition: border-color 0.2s; white-space: nowrap;
  }
  .fg-view-all:hover { border-color: #00d2ff; }

  .fg-feature-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  @media (min-width: 640px) {
    .fg-feature-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1024px) {
    .fg-feature-grid { grid-template-columns: repeat(4, 1fr); }
  }

  .fg-feat-card {
    padding: 2rem; border-radius: 0.75rem;
    transition: border 0.5s, box-shadow 0.5s, transform 0.5s;
  }
  .fg-feat-card.border-l-accent { border-left: 4px solid #00d2ff; }
  .fg-feat-icon-wrap {
    width: 56px; height: 56px; border-radius: 0.5rem;
    background: rgba(0,210,255,0.10);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 2rem;
    border: 1px solid rgba(0,210,255,0.20);
    transition: transform 0.3s;
  }
  .fg-feat-card:hover .fg-feat-icon-wrap { transform: scale(1.1); }
  .fg-feat-card h3 {
    font-family: 'Inter', sans-serif;
    font-size: 20px; line-height: 28px; font-weight: 700;
    color: #e3e3e3; margin-bottom: 0.75rem;
  }
  .fg-feat-card p {
    font-family: 'Inter', sans-serif;
    font-size: 16px; line-height: 1.65; font-weight: 400;
    color: rgba(196,199,197,1);
  }
  .fg-feat-icon { font-size: 30px !important; }

  .fg-login-section { display: flex; flex-direction: column; gap: 3rem; }
  .fg-login-heading { text-align: center; display: flex; flex-direction: column; gap: 0.75rem; }
  .fg-login-heading h2 {
    font-family: 'Inter', sans-serif;
    font-size: 36px; line-height: 44px; font-weight: 900;
    color: #e3e3e3; text-transform: uppercase;
  }
  .fg-login-heading p {
    font-family: 'Inter', sans-serif;
    font-size: 18px; line-height: 24px; font-weight: 400;
    color: rgba(196,199,197,1);
  }
  .fg-login-grid {
    display: grid; grid-template-columns: 1fr;
    gap: 2.5rem;
    max-width: 80rem; margin: 0 auto;
    padding: 0 1rem;
  }
  @media (min-width: 768px) {
    .fg-login-grid { padding: 0; }
  }
  @media (min-width: 1024px) {
    .fg-login-grid { grid-template-columns: repeat(3, 1fr); }
  }

  .fg-login-card {
    background: #1c1b1c;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 1rem; overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    transition: border-color 0.3s;
  }
  .fg-login-card.admin:hover    { border-color: rgba(0,210,255,0.4); }
  .fg-login-card.guest:hover    { border-color: rgba(0,210,255,0.4); }
  .fg-login-card.tactical:hover { border-color: rgba(0,210,255,0.4); }

  .fg-login-bar { height: 10px; }
  .fg-login-bar.admin    { background: #00d2ff; box-shadow: 0 0 15px rgba(0,210,255,0.3); }
  .fg-login-bar.guest    { background: #00d2ff; box-shadow: 0 0 15px rgba(0,210,255,0.3); }
  .fg-login-bar.tactical { background: #00d2ff; box-shadow: 0 0 15px rgba(0,210,255,0.3); }

  .fg-login-body {
    padding: 2rem 2.5rem;
    display: flex; flex-direction: column; gap: 2rem;
  }
  @media (min-width: 768px) {
    .fg-login-body { padding: 2.5rem; }
  }

  .fg-login-card-top { text-align: center; }
  .fg-login-card-icon {
    font-size: 48px !important; margin-bottom: 1rem; display: block;
    transition: transform 0.3s;
  }
  .fg-login-card:hover .fg-login-card-icon { transform: scale(1.1); }
  .fg-login-title {
    font-family: 'Inter', sans-serif;
    font-size: 24px; font-weight: 700; color: #e3e3e3;
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;
  }
  .fg-login-desc {
    font-family: 'Inter', sans-serif;
    font-size: 16px; line-height: 24px; font-weight: 400;
    color: rgba(196,199,197,1);
  }

  .fg-login-fields { display: flex; flex-direction: column; gap: 1.25rem; }
  .fg-login-field  { display: flex; flex-direction: column; gap: 4px; }

  .fg-input {
    width: 100%;
    padding: 20px 24px;
    border-radius: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px; letter-spacing: 0.06em;
  }
  @media (min-width: 768px) { .fg-input { font-size: 18px; } }

  .fg-btn {
    width: 100%; padding: 20px; border-radius: 0.75rem;
    font-family: 'Inter', sans-serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer; border: none;
    transition: opacity 0.2s, transform 0.1s;
  }
  .fg-btn:hover  { opacity: 0.9; }
  .fg-btn:active { transform: scale(0.95); }
  .fg-btn:disabled { opacity: 0.7; cursor: not-allowed; }

  .fg-btn.admin {
    background: #00d2ff; color: #003544;
    box-shadow: 0 20px 25px -5px rgba(0,210,255,0.2), 0 8px 10px -6px rgba(0,210,255,0.2);
  }
  .fg-btn.guest {
    background: #00d2ff; color: #003544;
    box-shadow: 0 20px 25px -5px rgba(0,210,255,0.2), 0 8px 10px -6px rgba(0,210,255,0.2);
  }
  .fg-btn.tactical {
    background: #00d2ff; color: #003544;
    box-shadow: 0 20px 25px -5px rgba(0,210,255,0.2), 0 8px 10px -6px rgba(0,210,255,0.2);
  }

  .fg-footer {
    background: #0e0e0f;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding: 3rem 2rem;
    width: 100%;
    display: flex; flex-direction: column;
    justify-content: space-between; align-items: center;
    gap: 2rem;
    position: relative; z-index: 10;
  }
  @media (min-width: 768px) {
    .fg-footer { flex-direction: row; }
  }
  .fg-footer-brand {
    display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
  }
  @media (min-width: 768px) {
    .fg-footer-brand { flex-direction: row; }
  }
  .fg-footer-brand-inner { display: flex; align-items: center; gap: 1rem; }
  .fg-footer-name {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 900; letter-spacing: 0.3em; color: #e3e3e3;
    font-size: 14px; text-transform: uppercase;
  }
  .fg-footer-copy {
    color: #8e918f;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.2em;
    text-transform: uppercase;
    border-left: 1px solid rgba(255,255,255,0.10); padding-left: 1.5rem;
    display: none;
  }
  @media (min-width: 768px) { .fg-footer-copy { display: block; } }
  .fg-footer-links {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 2.5rem;
  }
  .fg-footer-link {
    color: #8e918f;
    text-decoration: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;
    transition: color 0.2s; cursor: pointer;
  }
  .fg-footer-link:hover { color: #00d2ff; }

  .fg-modal-title {
    font-family: 'Inter', sans-serif;
    font-size: 24px; color: #e3e3e3; font-weight: 900;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .fg-modal-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; color: #00d2ff; letter-spacing: 0.2em;
  }
  .fg-modal-body-text {
    font-family: 'Inter', sans-serif;
    font-size: 16px; line-height: 24px; font-weight: 400;
    color: rgba(196,199,197,1);
  }
  .fg-modal-cancel {
    flex: 1; border: 1px solid #444746; color: rgba(196,199,197,0.9);
    padding: 1rem; border-radius: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase;
    cursor: pointer; background: transparent;
    transition: border-color 0.2s, color 0.2s;
  }
  .fg-modal-cancel:hover { border-color: #00d2ff; color: #00d2ff; }
  .fg-modal-proceed {
    flex: 1; background: #00d2ff; color: #003544;
    padding: 1rem; border-radius: 0.75rem; border: none;
    font-family: 'Inter', sans-serif;
    font-size: 16px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer; transition: opacity 0.2s, transform 0.1s;
  }
  .fg-modal-proceed:hover { opacity: 0.9; }
  .fg-modal-proceed:active { transform: scale(0.95); }

  .space-y-6 > * + * { margin-top: 1.5rem; }
  .space-y-2 > * + * { margin-top: 0.5rem; }
  .flex-gap4 { display: flex; gap: 1rem; }

  /* Server error message inside login card */
  .fg-server-error {
    color: #ffb4ab;
    font-size: 11px;
    letter-spacing: 0.06em;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
`;

/* ── DAF fallback OTP codes (mirrors DAFApp.jsx TEAM_FALLBACK_CODES) ── */
const DAF_FALLBACK_CODES = {
  ALPHA:   '4821',
  BETA:    '9281',
  CHARLIE: '6512',
  DELTA:   '1104',
};

const DAF_TEAMS = ['ALPHA', 'BETA', 'CHARLIE', 'DELTA'];

/* ── Role config for success modal ── */
const ROLE_CONFIG = {
  admin:    { label: 'COMMAND ADMIN',   body: 'Full system override access initializing.' },
  guest:    { label: 'HOTEL GUEST HUB', body: 'Personal safety portal loading for your room.' },
  tactical: { label: 'DAF TACTICAL',    body: 'Secure uplink to responder network establishing.' },
};

/* ─────────────────────────────────────────────────────────────────────────
   validateCredentials
   Returns null on success, or { error: string } on failure.
   This is the single source of truth for auth logic.
───────────────────────────────────────────────────────────────────────── */
function validateCredentials(role, { user = '', pass = '' }) {
  if (role === 'admin') {
    // Admin: require both fields non-empty (demo — swap for real API call)
    if (!user.trim()) return { error: 'User ID is required.' };
    if (!pass.trim()) return { error: 'Password is required.' };
    return null;
  }

  if (role === 'guest') {
    if (!user.trim()) return { error: 'Room / User ID is required.' };
    if (!pass.trim()) return { error: 'Password is required.' };
    return null;
  }

  if (role === 'tactical') {
    const otp = user.trim();
    if (!otp) return { error: 'Tactical OTP is required.' };

    // Check localStorage-stored codes first (set by admin panel)
    const matchedStored = DAF_TEAMS.find(t => {
      const stored = localStorage.getItem(`daf_otp_${t.toLowerCase()}`);
      return stored && stored === otp;
    });
    if (matchedStored) return null;

    // Fall back to hardcoded codes
    const matchedFallback = DAF_TEAMS.find(t => DAF_FALLBACK_CODES[t] === otp);
    if (matchedFallback) return null;

    return { error: 'INVALID AUTHORIZATION CODE' };
  }

  return null;
}

/* ── Particle Canvas ─────────────────────────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const particles = [];

    function resizeCanvas() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function randomBetween(a, b) { return a + Math.random() * (b - a); }

    for (let i = 0; i < 60; i++) {
      particles.push({
        x:     randomBetween(0, window.innerWidth),
        y:     randomBetween(0, window.innerHeight),
        r:     randomBetween(1, 2.5),
        dx:    randomBetween(-0.3, 0.3),
        dy:    randomBetween(-0.6, -0.15),
        alpha: randomBetween(0.2, 0.7),
        color: Math.random() > 0.5 ? '#00d2ff' : '#004a77',
      });
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = randomBetween(0, canvas.width); }
        if (p.x < -10 || p.x > canvas.width + 10) { p.x = randomBetween(0, canvas.width); }
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(drawParticles);
    }
    drawParticles();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="fg-canvas" />;
}

/* ── Scroll Reveal Hook ──────────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Toast ───────────────────────────────────────────────────────────── */
function Toast({ message, type, visible }) {
  return (
    <div className={`fg-toast${visible ? ' show' : ''} ${type || 'success'}`}>
      {message}
    </div>
  );
}

/* ── Success Modal ───────────────────────────────────────────────────── */
function SuccessModal({ role, onClose, onProceed }) {
  const cfg = role ? ROLE_CONFIG[role] : null;
  return (
    <div className={`modal-overlay${role ? ' open' : ''}`}>
      <div className="modal-box">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(0,210,255,0.10)',
            border: '1px solid rgba(0,210,255,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto',
          }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 48, color: '#00d2ff', fontVariationSettings: "'FILL' 1" }}
            >
              verified
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p className="fg-modal-badge">ACCESS GRANTED</p>
            <h2 className="fg-modal-title">{cfg?.label || 'Session Authorized'}</h2>
            <p className="fg-modal-body-text">{cfg?.body || 'Loading secure environment…'}</p>
          </div>
          <div className="flex-gap4">
            <button className="fg-modal-cancel" onClick={onClose}>Cancel</button>
            <button className="fg-modal-proceed" onClick={onProceed}>Proceed</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LoginCard
   ─ onLogin(role, credentials) → null | { error: string }
     The parent validates and returns an error string or null.
     If null  → pendingRole is set → success modal opens → proceed navigates.
     If error → serverError is shown inline; modal never opens.
───────────────────────────────────────────────────────────────────────── */
function LoginCard({
  role, icon, iconClass, iconColor,
  title, desc, userPlaceholder, passPlaceholder,
  btnLabel, cardClass, barClass, btnClass,
  transitionDelay,
  onLogin,
  singleField = false,
}) {
  const [user, setUser]               = useState('');
  const [pass, setPass]               = useState('');
  const [userErr, setUserErr]         = useState(false);
  const [passErr, setPassErr]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [serverError, setServerError] = useState(''); // ← auth / OTP error

  const validate = useCallback(() => {
    let ok = true;
    if (!user.trim()) { setUserErr(true); ok = false; }
    if (!singleField && !pass.trim()) { setPassErr(true); ok = false; }
    return ok;
  }, [user, pass, singleField]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;
    setServerError('');
    setLoading(true);
    setTimeout(() => {
      // onLogin returns null on success or { error } on failure
      const result = onLogin(role, { user, pass });
      setLoading(false);
      if (result?.error) {
        setServerError(result.error);
      }
      // If result is null the parent already set pendingRole → modal opens
    }, 1400);
  }, [validate, onLogin, role, user, pass]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter') handleSubmit();
  }, [handleSubmit]);

  return (
    <div
      className={`fg-login-card ${cardClass} reveal visible`}
      style={transitionDelay ? { transitionDelay } : {}}
    >
      <div className={`fg-login-bar ${barClass}`} />
      <div className="fg-login-body">
        {/* Top */}
        <div className="fg-login-card-top">
          <span
            className={`material-symbols-outlined fg-login-card-icon${iconClass ? ' ' + iconClass : ''}`}
            style={{ color: iconColor }}
          >
            {icon}
          </span>
          <h3 className="fg-login-title">{title}</h3>
          <p className="fg-login-desc">{desc}</p>
        </div>

        {/* Fields */}
        <div className="fg-login-fields">

          <div className="fg-login-field">
            <input
              className={`fg-input input-dark${userErr ? ' error' : ''}`}
              placeholder={userPlaceholder}
              type="text"
              value={user}
              style={userErr ? { borderColor: '#ffb4ab' } : {}}
              onChange={e => { setUser(e.target.value); setUserErr(false); setServerError(''); }}
              onKeyDown={handleKey}
            />
            <p className={`field-error${userErr ? ' show' : ''}`}>
              {userPlaceholder} is required.
            </p>
          </div>

          {!singleField && (
            <div className="fg-login-field">
              <input
                className={`fg-input input-dark${passErr ? ' error' : ''}`}
                placeholder={passPlaceholder}
                type="password"
                value={pass}
                style={passErr ? { borderColor: '#ffb4ab' } : {}}
                onChange={e => { setPass(e.target.value); setPassErr(false); setServerError(''); }}
                onKeyDown={handleKey}
              />
              <p className={`field-error${passErr ? ' show' : ''}`}>
                Password is required.
              </p>
            </div>
          )}

          {/* ── Server / OTP error ── */}
          {serverError && (
            <p className="fg-server-error">
              <span>⚠</span> {serverError}
            </p>
          )}

          <button
            className={`fg-btn ${btnClass}`}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                <span>AUTHENTICATING…</span>
              </>
            ) : (
              btnLabel
            )}
          </button>

        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LandingPage
───────────────────────────────────────────────────────────────────────── */
export default function LandingPage({ onAdminAuthSuccess, onGuestAuthSuccess, onDafAuthSuccess }) {
  const [pendingRole, setPendingRole] = useState(null);
  const [toast, setToast]             = useState({ visible: false, message: '', type: 'success' });

  useReveal();

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3500);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     handleLogin — called by LoginCard with (role, { user, pass })
     Returns null on success (opens modal) or { error } (shown inline).
  ───────────────────────────────────────────────────────────────────── */
  const handleLogin = useCallback((role, credentials = {}) => {
    const validationError = validateCredentials(role, credentials);
    if (validationError) return validationError; // card renders this inline
    setPendingRole(role);                         // opens success modal
    return null;
  }, []);

  const handleModalClose = useCallback(() => {
    setPendingRole(null);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     handleProceed — user clicked "Proceed" in the success modal
     This is where actual navigation happens.
  ───────────────────────────────────────────────────────────────────── */
  const handleProceed = useCallback(() => {
    const role = pendingRole;
    setPendingRole(null);
    showToast('SESSION ACTIVE — ENVIRONMENT LOADING', 'success');
    setTimeout(() => {
      if (role === 'admin')         onAdminAuthSuccess?.();
      else if (role === 'guest')    onGuestAuthSuccess?.();
      else if (role === 'tactical') onDafAuthSuccess?.();
    }, 600);
  }, [pendingRole, onAdminAuthSuccess, onGuestAuthSuccess, onDafAuthSuccess, showToast]);

  return (
    <div className="fg-root">
      <style>{STYLES}</style>

      <ParticleCanvas />

      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <header className="fg-header">
        <div className="fg-header-left">
          <span className="fg-logo-word">FIREGUARD</span>
          <span className="fg-logo-sub">HMS</span>
        </div>
        <div className="fg-header-right">
          <nav className="fg-nav">
            <a className="fg-nav-link active" href="#">DASHBOARD</a>
            <a className="fg-nav-link" href="#">SYSTEM MAP</a>
            <a className="fg-nav-link" href="#">RESPONSE LOGS</a>
          </nav>
          <div className="fg-status-pill glow-accent">
            <div className="fg-status-dot" />
            <span className="fg-status-label">SYSTEM LIVE</span>
          </div>
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════════════════════════════ */}
      <main className="fg-main">

        {/* ── Hero ── */}
        <section className="fg-hero hero-gradient reveal visible">
          <div className="fg-hero-inner">
            <div>
              <div className="fg-hero-badge">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>security</span>
                V4.2.0 SECURE TERMINAL
              </div>
            </div>
            <h1>
              Intelligent Emergency Infrastructure &amp;&nbsp;
              <span className="text-primary">Real-Time Life Safety</span> Management
            </h1>
            <p>
              Next-generation command and control featuring AI-assisted detection, high-fidelity 3D building
              mapping, and autonomous evacuation routing for high-stakes environments.
            </p>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="fg-features">
          <div className="fg-section-header reveal visible">
            <div className="fg-section-header-left">
              <h2>Integrated Protocol Modules</h2>
              <p>Real-time telemetry and management subsystems.</p>
            </div>
            <a className="fg-view-all" href="#">VIEW ALL SERVICES</a>
          </div>

          <div className="fg-feature-grid">
            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>3d_rotation</span>
              </div>
              <h3>3D Hotel Map</h3>
              <p>High-fidelity spatial rendering of all structures and utilities.</p>
            </div>

            <div className="glass-card fg-feat-card border-l-accent reveal visible">
              <div className="fg-feat-icon-wrap" style={{ background: 'rgba(0,210,255,0.10)', border: '1px solid rgba(0,210,255,0.20)' }}>
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>psychology</span>
              </div>
              <h3>AI Detection</h3>
              <p>Neural networks monitoring visual and thermal sensors for anomalies.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>alt_route</span>
              </div>
              <h3>Smart Routing</h3>
              <p>Dynamic exit path optimization based on hazard density.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>translate</span>
              </div>
              <h3>Polyglot Voice</h3>
              <p>Automated PA system supporting 48 languages for evacuation.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap" style={{ background: 'rgba(0,210,255,0.10)', border: '1px solid rgba(0,210,255,0.20)' }}>
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>videocam</span>
              </div>
              <h3>WebRTC Feed</h3>
              <p>Ultra-low latency tactical video streaming for responders.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>local_fire_department</span>
              </div>
              <h3>DAF Tactical</h3>
              <p>Deployable autonomous firefighting units coordination.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>sensors</span>
              </div>
              <h3>IoT Nodes</h3>
              <p>Distributed sensor mesh monitoring pressure and smoke.</p>
            </div>

            <div className="glass-card fg-feat-card reveal visible">
              <div className="fg-feat-icon-wrap">
                <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>groups</span>
              </div>
              <h3>Occupancy</h3>
              <p>Real-time heatmaps for precise search and rescue operations.</p>
            </div>
          </div>
        </section>

        {/* ── Login Section ── */}
        <section className="fg-login-section">
          <div className="fg-login-heading reveal visible">
            <h2>Secure Portal Access</h2>
            <p>Select your operational clearance to begin session.</p>
          </div>

          <div className="fg-login-grid">

            {/* ── Admin ── */}
            <LoginCard
              role="admin"
              icon="admin_panel_settings"
              iconColor="#00d2ff"
              title="Command Admin"
              desc="Full system override and global logistics control."
              userPlaceholder="USER ID"
              passPlaceholder="PASSWORD"
              btnLabel="Authorize Admin"
              cardClass="admin"
              barClass="admin"
              btnClass="admin"
              onLogin={handleLogin}
            />

            {/* ── Guest ── */}
            <LoginCard
              role="guest"
              icon="meeting_room"
              iconColor="#00d2ff"
              title="Hotel Guest"
              desc="Safety guidance and personal evacuation assist."
              userPlaceholder="ROOM / USER ID"
              passPlaceholder="PASSWORD"
              btnLabel="Enter Safety Hub"
              cardClass="guest"
              barClass="guest"
              btnClass="guest"
              transitionDelay="100ms"
              onLogin={handleLogin}
            />

            {/* ── DAF Tactical — OTP only, no password field ── */}
            <LoginCard
              role="tactical"
              icon="local_fire_department"
              iconColor="#00d2ff"
              title="DAF Tactical"
              desc="Enter Tactical OTP to access responder network."
              userPlaceholder="TACTICAL OTP"
              btnLabel="Verify OTP"
              cardClass="tactical"
              barClass="tactical"
              btnClass="tactical"
              transitionDelay="200ms"
              onLogin={handleLogin}
              singleField              /* ← OTP only; no password field rendered */
            />

          </div>
        </section>
      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer className="fg-footer">
        <div className="fg-footer-brand">
          <div className="fg-footer-brand-inner">
            <span className="fg-footer-name">FIREGUARD HMS</span>
          </div>
          <span className="fg-footer-copy">© 2024 | SECURE TERMINAL v4.2.0</span>
        </div>
        <div className="fg-footer-links">
          <a className="fg-footer-link" href="#">SECURITY PROTOCOLS</a>
          <a className="fg-footer-link" href="#">SYSTEM STATUS</a>
          <a className="fg-footer-link" href="#">HELP DESK</a>
        </div>
      </footer>

      {/* ══ SUCCESS MODAL ═══════════════════════════════════════════════ */}
      <SuccessModal
        role={pendingRole}
        onClose={handleModalClose}
        onProceed={handleProceed}
      />

      {/* ══ TOAST ═══════════════════════════════════════════════════════ */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}
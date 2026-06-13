import React, { useEffect, useRef, useState, useCallback } from 'react';
import HotelView3D from '../views/HotelView3D';// adjust import path as needed

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
    background: transparent; border: none; cursor: pointer;
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

  .fg-login-dropdown { position: relative; }
  .fg-login-dropdown-btn {
    display: flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; letter-spacing: 0.2em;
    background: transparent; border: none; cursor: pointer;
    color: rgba(196,199,197,1); font-weight: 500;
    transition: color 0.2s ease; padding: 4px 8px;
  }
  .fg-login-dropdown-btn:hover,
  .fg-login-dropdown-btn.open { color: #00d2ff; }
  .fg-login-dropdown-btn .material-symbols-outlined {
    font-size: 18px;
    transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  }
  .fg-login-dropdown-btn.open .material-symbols-outlined { transform: rotate(180deg); }

  .fg-login-dropdown-menu {
    position: absolute; top: calc(100% + 14px); right: 0;
    min-width: 230px;
    background: #1c1b1c;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    opacity: 0; visibility: hidden;
    transform: translateY(-12px) scale(0.97);
    transform-origin: top right;
    transition: opacity 0.25s cubic-bezier(0.4,0,0.2,1),
                transform 0.25s cubic-bezier(0.4,0,0.2,1),
                visibility 0.25s;
    z-index: 60;
  }
  .fg-login-dropdown-menu.open {
    opacity: 1; visibility: visible;
    transform: translateY(0) scale(1);
  }
  .fg-login-dropdown-item {
    display: flex; align-items: center; gap: 12px;
    width: 100%; padding: 14px 20px;
    background: transparent; border: none; cursor: pointer;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; letter-spacing: 0.18em; font-weight: 700;
    text-transform: uppercase;
    color: rgba(196,199,197,1);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: background 0.2s ease, color 0.2s ease;
  }
  .fg-login-dropdown-item:last-child { border-bottom: none; }
  .fg-login-dropdown-item:hover { background: rgba(0,210,255,0.08); color: #00d2ff; }
  .fg-login-dropdown-item .material-symbols-outlined { font-size: 18px; color: #00d2ff; }

  .fg-login-screen {
    position: fixed; inset: 0; z-index: 100;
    display: flex; flex-direction: column;
    background-color: rgba(19,19,20,0.92);
    animation: fade-in-up 0.5s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .fg-login-screen-header {
    position: relative; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 2rem; height: 80px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(19,19,20,0.90);
    backdrop-filter: blur(24px);
  }
  .fg-login-screen-back {
    display: flex; align-items: center; gap: 8px;
    background: transparent; border: 1px solid rgba(255,255,255,0.10);
    color: rgba(196,199,197,1);
    padding: 10px 20px; border-radius: 9999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
    cursor: pointer; transition: border-color 0.2s ease, color 0.2s ease;
  }
  .fg-login-screen-back:hover { border-color: #00d2ff; color: #00d2ff; }
  .fg-login-screen-back .material-symbols-outlined { font-size: 18px; }

  .fg-login-screen-body {
    position: relative; z-index: 10;
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 3rem 1.5rem;
  }
  .fg-login-screen-body .fg-login-grid {
    grid-template-columns: 1fr;
    max-width: 480px;
    width: 100%;
  }

  .fg-sysmap-view {
    position: fixed; inset: 0; z-index: 80;
    display: flex; flex-direction: column;
    background-color: #0a0a0f;
    animation: fade-in-up 0.4s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .fg-sysmap-header {
    position: relative; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 2rem; height: 80px; flex-shrink: 0;
    border-bottom: 1px solid rgba(0,210,255,0.12);
    background: rgba(10,10,15,0.95);
    backdrop-filter: blur(24px);
  }
  .fg-sysmap-header-left { display: flex; align-items: center; gap: 1.5rem; }
  .fg-sysmap-back {
    display: flex; align-items: center; gap: 8px;
    background: transparent; border: 1px solid rgba(255,255,255,0.10);
    color: rgba(196,199,197,1);
    padding: 10px 20px; border-radius: 9999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
    cursor: pointer; transition: border-color 0.2s ease, color 0.2s ease;
  }
  .fg-sysmap-back:hover { border-color: #00d2ff; color: #00d2ff; }
  .fg-sysmap-back .material-symbols-outlined { font-size: 18px; }
  .fg-sysmap-title {
    display: flex; align-items: center; gap: 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; letter-spacing: 0.25em; font-weight: 700;
    color: rgba(180,190,255,0.8); text-transform: uppercase;
  }
  .fg-sysmap-title-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #00d2ff;
    box-shadow: 0 0 8px #00d2ff;
    animation: animate-pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite;
  }
  .fg-sysmap-badge {
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,210,255,0.08);
    border: 1px solid rgba(0,210,255,0.18);
    border-radius: 9999px; padding: 6px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.2em; font-weight: 600;
    color: rgba(0,210,255,0.85);
  }
  .fg-sysmap-body {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  .fg-sysmap-overlay-hint {
    position: absolute; bottom: 80px; left: 50%;
    transform: translateX(-50%);
    display: flex; align-items: center; gap: 8px;
    background: rgba(8,8,24,0.75);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(120,140,255,0.18);
    border-radius: 9999px;
    padding: 8px 18px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.18em;
    color: rgba(180,190,255,0.65);
    pointer-events: none; z-index: 5;
    animation: fade-in-up 0.6s 0.3s cubic-bezier(0.4,0,0.2,1) both;
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

/* ─────────────────────────────────────────────────────────────────────────
   API BASE URL — uses env var if set, falls back to hardcoded backend URL.
   This ensures the correct backend is always called regardless of which
   domain the frontend is served from.
─────────────────────────────────────────────────────────────────────────*/
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
    ? import.meta.env.VITE_API_URL
    : 'https://fireguard-backend-abhx.onrender.com/api';

/* ── Role config for success modal ── */
const ROLE_CONFIG = {
  admin: { label: 'COMMAND ADMIN', body: 'Full system override access initializing.' },
  guest: { label: 'HOTEL GUEST HUB', body: 'Personal safety portal loading for your room.' },
  tactical: { label: 'DAF TACTICAL', body: 'Identity verified. You will now be prompted for your team OTP to complete authentication.' },
};

/* ── LoginCard configs, keyed by role ── */
const LOGIN_CARD_CONFIGS = {
  admin: {
    icon: 'admin_panel_settings',
    iconColor: '#00d2ff',
    title: 'Command Admin',
    desc: 'Full system override and global logistics control.',
    userPlaceholder: 'USER ID',
    passPlaceholder: 'PASSWORD',
    btnLabel: 'Authorize Admin',
    cardClass: 'admin',
    barClass: 'admin',
    btnClass: 'admin',
  },
  guest: {
    icon: 'meeting_room',
    iconColor: '#00d2ff',
    title: 'Hotel Guest',
    desc: 'Safety guidance and personal evacuation assist.',
    userPlaceholder: 'FIRST NAME',
    passPlaceholder: 'PASSCODE(First 3 letters + Room #)',
    btnLabel: 'Enter Safety Hub',
    cardClass: 'guest',
    barClass: 'guest',
    btnClass: 'guest',
  },
  tactical: {
    icon: 'local_fire_department',
    iconColor: '#00d2ff',
    title: 'DAF Tactical',
    desc: 'Access the DAF responder network. You will be prompted for your team OTP.',
    btnLabel: 'Access DAF Portal',
    cardClass: 'tactical',
    barClass: 'tactical',
    btnClass: 'tactical',
    noFields: true,
  },
};

/* ── Items shown inside the LOGIN dropdown ── */
const LOGIN_MENU_ITEMS = [
  { role: 'admin', label: 'Login as Admin', icon: 'admin_panel_settings' },
  { role: 'guest', label: 'Login as Guest', icon: 'meeting_room' },
  { role: 'tactical', label: 'Login as DAF Team', icon: 'local_fire_department' },
];

/* ─────────────────────────────────────────────────────────────────────────
   authenticateRole
─────────────────────────────────────────────────────────────────────────*/
async function authenticateRole(role, { user = '', pass = '' }) {
  if (role === 'admin') {
    if (!user.trim()) return { success: false, error: 'User ID is required.' };
    if (!pass.trim()) return { success: false, error: 'Password is required.' };
    if (user === 'admin' && pass === 'admin123') return { success: true };
    return { success: false, error: 'Invalid Administrative Credentials.' };
  }

  if (role === 'guest') {
    if (!user.trim()) return { success: false, error: 'First Name is required.' };
    if (!pass.trim()) return { success: false, error: 'Passcode is required.' };
    try {
      // ✅ Uses API_BASE — always points to the real backend, never the frontend domain
      const response = await fetch(`${API_BASE}/v1/auth/guest-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: user.trim(), password: pass.trim() }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const raw = data.guest || data;
        const normalizedProfile = {
          name: raw.name || raw.full_name || '',
          full_name: raw.full_name || raw.name || '',
          room: String(raw.room || raw.roomId || raw.room_assignment || ''),
          roomId: String(raw.room || raw.roomId || raw.room_assignment || ''),
          room_id: String(raw.room || raw.roomId || raw.room_assignment || ''),
          checkOutDate: raw.check_out_date || raw.checkOutDate || raw.check_out || null,
          check_out_date: raw.check_out_date || raw.checkOutDate || raw.check_out || null,
          check_out: raw.check_out_date || raw.checkOutDate || raw.check_out || null,
          nights: raw.nights ?? null,
          id: raw.id,
        };
        sessionStorage.setItem('guestProfile', JSON.stringify(normalizedProfile));
        if (data.token || data.access_token) {
          sessionStorage.setItem('guestToken', data.token || data.access_token);
        }
        return { success: true, redirect: '/guest.html' };
      }
      return { success: false, error: data.message || 'Authentication failed. Verify your name and room configurations.' };
    } catch (err) {
      console.error('FastAPI Connection Timeout:', err);
      return { success: false, error: 'Unable to reach the centralized verification matrix.' };
    }
  }

  if (role === 'tactical') {
    return { success: true, redirect: '/daf.html' };
  }

  return { success: false, error: 'Unknown role.' };
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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function randomBetween(a, b) { return a + Math.random() * (b - a); }

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: randomBetween(0, window.innerWidth),
        y: randomBetween(0, window.innerHeight),
        r: randomBetween(1, 2.5),
        dx: randomBetween(-0.3, 0.3),
        dy: randomBetween(-0.6, -0.15),
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
      entries => { entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }); },
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
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#00d2ff', fontVariationSettings: "'FILL' 1" }}>
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
─────────────────────────────────────────────────────────────────────────*/
function LoginCard({
  role, icon, iconClass, iconColor,
  title, desc, userPlaceholder, passPlaceholder,
  btnLabel, cardClass, barClass, btnClass,
  transitionDelay,
  onLogin,
  noFields = false,
}) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [userErr, setUserErr] = useState(false);
  const [passErr, setPassErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validate = useCallback(() => {
    if (noFields) return true;
    let ok = true;
    if (!user.trim()) { setUserErr(true); ok = false; }
    if (passPlaceholder && !pass.trim()) { setPassErr(true); ok = false; }
    return ok;
  }, [user, pass, noFields, passPlaceholder]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setServerError('');
    setLoading(true);
    const result = await onLogin(role, { user, pass });
    setLoading(false);
    if (!result.success && result.error) setServerError(result.error);
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

        <div className="fg-login-fields">
          {!noFields && (
            <>
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
                <p className={`field-error${userErr ? ' show' : ''}`}>{userPlaceholder} is required.</p>
              </div>

              {passPlaceholder && (
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
                  <p className={`field-error${passErr ? ' show' : ''}`}>Password is required.</p>
                </div>
              )}
            </>
          )}

          {serverError && (
            <p className="fg-server-error"><span>⚠</span> {serverError}</p>
          )}

          <button className={`fg-btn ${btnClass}`} onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <><span className="spinner" /><span>AUTHENTICATING…</span></>
            ) : btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LoginScreen — full-screen dedicated view for a single role
─────────────────────────────────────────────────────────────────────────*/
function LoginScreen({ role, onBack, onLogin }) {
  const cfg = LOGIN_CARD_CONFIGS[role];
  if (!cfg) return null;

  return (
    <div className="fg-login-screen hero-gradient">
      <div className="fg-login-screen-header">
        <div className="fg-header-left">
          <span className="fg-logo-word">FIREGUARD</span>
          <span className="fg-logo-sub">HMS</span>
        </div>
        <button className="fg-login-screen-back" onClick={onBack}>
          <span className="material-symbols-outlined">arrow_back</span>
          BACK TO DASHBOARD
        </button>
      </div>
      <div className="fg-login-screen-body">
        <div className="fg-login-grid">
          <LoginCard role={role} {...cfg} onLogin={onLogin} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SystemMapView — full-screen 3D hotel map embedded in the landing page
─────────────────────────────────────────────────────────────────────────*/
function SystemMapView({ onBack }) {
  return (
    <div className="fg-sysmap-view">
      <div className="fg-sysmap-header">
        <div className="fg-sysmap-header-left">
          <button className="fg-sysmap-back" onClick={onBack}>
            <span className="material-symbols-outlined">arrow_back</span>
            BACK TO DASHBOARD
          </button>
          <div className="fg-sysmap-title">
            <div className="fg-sysmap-title-dot" />
            SYSTEM MAP — 3D HOTEL VIEW
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="fg-sysmap-badge">
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#00d2ff' }}>3d_rotation</span>
            LIVE · READ-ONLY
          </div>
          <div className="fg-header-left" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '1.5rem' }}>
            <span className="fg-logo-word" style={{ fontSize: 15 }}>FIREGUARD</span>
            <span className="fg-logo-sub">HMS</span>
          </div>
        </div>
      </div>

      <div className="fg-sysmap-body">
        <HotelView3D
          onRoomClick={() => { }}
          evacuationPath={[]}
          viewMode="map"
          focusRoomId={null}
          isRescueMode={false}
          isGuest={false}
          alertRooms={[]}
          roomStatuses={{}}
        />
        <div className="fg-sysmap-overlay-hint">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>info</span>
          Read-only preview — log in as Admin for full control
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LandingPage
─────────────────────────────────────────────────────────────────────────*/
export default function LandingPage({ onAdminAuthSuccess, onGuestAuthSuccess, onDafAuthSuccess }) {
  const [pendingRole, setPendingRole] = useState(null);
  const [pendingRedirect, setPendingRedirect] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const [activeLoginScreen, setActiveLoginScreen] = useState(null);
  const [showSystemMap, setShowSystemMap] = useState(false);

  const loginDropdownRef = useRef(null);

  useReveal();

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3500);
  }, []);

  useEffect(() => {
    if (!loginMenuOpen) return;
    const handleClickOutside = (e) => {
      if (loginDropdownRef.current && !loginDropdownRef.current.contains(e.target)) {
        setLoginMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [loginMenuOpen]);

  const handleSelectLoginRole = useCallback((role) => {
    setLoginMenuOpen(false);
    setActiveLoginScreen(role);
  }, []);

  const handleBackFromLoginScreen = useCallback(() => {
    setActiveLoginScreen(null);
  }, []);

  const handleLogin = useCallback(async (role, credentials = {}) => {
    const result = await authenticateRole(role, credentials);
    if (!result.success) return { success: false, error: result.error };
    if (result.redirect) setPendingRedirect(result.redirect);
    setPendingRole(role);
    return { success: true };
  }, []);

  const handleModalClose = useCallback(() => {
    setPendingRole(null);
    setPendingRedirect(null);
  }, []);

  const handleProceed = useCallback(() => {
    const role = pendingRole;
    const redirect = pendingRedirect;
    setPendingRole(null);
    setPendingRedirect(null);
    setActiveLoginScreen(null);
    showToast('SESSION ACTIVE — ENVIRONMENT LOADING', 'success');
    setTimeout(() => {
      if (redirect) {
        window.location.href = redirect;
      } else if (role === 'admin') {
        onAdminAuthSuccess?.();
      } else if (role === 'guest') {
        onGuestAuthSuccess?.();
      } else if (role === 'tactical') {
        window.location.href = '/daf.html';
      }
    }, 600);
  }, [pendingRole, pendingRedirect, onAdminAuthSuccess, onGuestAuthSuccess, showToast]);

  return (
    <div className="fg-root">
      <style>{STYLES}</style>

      <ParticleCanvas />

      {showSystemMap && (
        <SystemMapView onBack={() => setShowSystemMap(false)} />
      )}

      {activeLoginScreen && !showSystemMap && (
        <LoginScreen
          role={activeLoginScreen}
          onBack={handleBackFromLoginScreen}
          onLogin={handleLogin}
        />
      )}

      <header className="fg-header">
        <div className="fg-header-left">
          <span className="fg-logo-word">FIREGUARD</span>
          <span className="fg-logo-sub">HMS</span>
        </div>
        <div className="fg-header-right">
          <nav className="fg-nav">
            <button
              className={`fg-nav-link${!showSystemMap ? ' active' : ''}`}
              onClick={() => { setShowSystemMap(false); setActiveLoginScreen(null); }}
            >
              DASHBOARD
            </button>

            <button
              className={`fg-nav-link${showSystemMap ? ' active' : ''}`}
              onClick={() => { setShowSystemMap(true); setActiveLoginScreen(null); }}
            >
              SYSTEM MAP
            </button>

            <div className="fg-login-dropdown" ref={loginDropdownRef}>
              <button
                className={`fg-login-dropdown-btn${loginMenuOpen ? ' open' : ''}`}
                onClick={() => setLoginMenuOpen(o => !o)}
                aria-haspopup="true"
                aria-expanded={loginMenuOpen}
              >
                LOGIN
                <span className="material-symbols-outlined">expand_more</span>
              </button>

              <div className={`fg-login-dropdown-menu${loginMenuOpen ? ' open' : ''}`}>
                {LOGIN_MENU_ITEMS.map(item => (
                  <button
                    key={item.role}
                    className="fg-login-dropdown-item"
                    onClick={() => handleSelectLoginRole(item.role)}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="fg-status-pill glow-accent">
            <div className="fg-status-dot" />
            <span className="fg-status-label">SYSTEM LIVE</span>
          </div>
        </div>
      </header>

      {!showSystemMap && (
        <>
          <main className="fg-main">
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

            <section className="fg-features">
              <div className="fg-section-header reveal visible">
                <div className="fg-section-header-left">
                  <h2>Integrated Protocol Modules</h2>
                  <p>Real-time telemetry and management subsystems.</p>
                </div>
                <a className="fg-view-all" href="#">VIEW ALL SERVICES</a>
              </div>

              <div className="fg-feature-grid">
                <div
                  className="glass-card fg-feat-card reveal visible"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowSystemMap(true)}
                >
                  <div className="fg-feat-icon-wrap">
                    <span className="material-symbols-outlined fg-feat-icon" style={{ color: '#00d2ff' }}>3d_rotation</span>
                  </div>
                  <h3>3D Hotel Map</h3>
                  <p>High-fidelity spatial rendering of all structures and utilities.</p>
                </div>

                <div className="glass-card fg-feat-card reveal visible">
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
          </main>

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
        </>
      )}

      <SuccessModal
        role={pendingRole}
        onClose={handleModalClose}
        onProceed={handleProceed}
      />

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}
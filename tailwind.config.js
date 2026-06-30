/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media', // follow the browser's dark-mode preference
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      keyframes: {
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.35' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        glitchShift: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-1px, 1px)' },
          '40%': { transform: 'translate(-1px, -1px)' },
          '60%': { transform: 'translate(1px, 1px)' },
          '80%': { transform: 'translate(1px, -1px)' },
        },
        caret: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        missionSlide: {
          '0%': { opacity: '0', transform: 'translateY(-0.75rem)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        missionSignal: {
          '0%': { opacity: '0', transform: 'scale(0.92)', filter: 'blur(3px)' },
          '20%, 75%': { opacity: '1', transform: 'scale(1)', filter: 'blur(0)' },
          '100%': { opacity: '0.45', transform: 'scale(1.02)', filter: 'blur(1px)' },
        },
        missionFail: {
          '0%': { opacity: '0', transform: 'translateX(-5px) skewX(-5deg)' },
          '18%': { opacity: '1', transform: 'translateX(4px) skewX(3deg)' },
          '32%': { transform: 'translateX(-2px)' },
          '48%, 100%': { opacity: '1', transform: 'translateX(0) skewX(0)' },
        },
        missionReady: {
          '0%': { opacity: '0', transform: 'translateY(8px)', filter: 'blur(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        missionCta: {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.96)' },
          '65%': { opacity: '1', transform: 'translateY(0) scale(1.025)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        missionCtaGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(253, 230, 138, 0.24)' },
          '50%': { boxShadow: '0 0 38px rgba(253, 230, 138, 0.55)' },
        },
        decryptAttempt: {
          '0%': { opacity: '0', transform: 'scale(1.08) skewX(-3deg)' },
          '18%': { opacity: '1', transform: 'scale(1) skewX(2deg)' },
          '35%': { transform: 'translateX(-2px) skewX(-2deg)' },
          '55%': { transform: 'translateX(2px) skewX(1deg)' },
          '100%': { opacity: '1', transform: 'translateX(0) skewX(0)' },
        },
        decryptScan: {
          '0%': { top: '0%', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
      },
      animation: {
        flicker: 'flicker 4s linear infinite',
        scanline: 'scanline 6s linear infinite',
        glitchShift: 'glitchShift 1.2s steps(2) infinite',
        caret: 'caret 1s steps(1) infinite',
        missionSlide: 'missionSlide 180ms ease-out',
        missionSignal: 'missionSignal 1.1s ease-out both',
        missionFail: 'missionFail 650ms steps(2, end) both',
        missionReady: 'missionReady 450ms ease-out both',
        missionCta:
          'missionCta 520ms ease-out both, missionCtaGlow 1.8s ease-in-out 520ms infinite',
        decryptAttempt: 'decryptAttempt 480ms steps(2, end) both',
        decryptScan: 'decryptScan 480ms linear both',
      },
    },
  },
  plugins: [],
};

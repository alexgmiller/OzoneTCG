"use client";

import { useState, useEffect } from "react";

const MESSAGES = [
  "Loading your collection...",
  "Fetching market data...",
  "Preparing inventory...",
  "Almost ready...",
];

export default function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length);
      setKey((k) => k + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-screen-inner">
        <div className="loading-wordmark">
          <span style={{ color: "var(--accent-primary)" }}>Ozone</span>
          <span style={{ color: "var(--text-bright)" }}>TCG</span>
        </div>
        <div className="loading-ring" />
        <p key={key} className="loading-message">
          {MESSAGES[msgIdx]}
        </p>
      </div>
    </div>
  );
}

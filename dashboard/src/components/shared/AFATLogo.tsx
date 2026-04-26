import React from 'react';

export function AFATLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={className} 
      fill="currentColor" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main 'A' Triangle */}
      <path d="M50 5 L90 85 L10 85 Z" />
      
      {/* Curving Road cutout */}
      <path 
        d="M15 85 Q40 60 50 45 Q60 30 85 30 L90 35 Q65 35 55 50 Q45 65 20 85 Z" 
        fill="#080c14" 
      />
      
      {/* Car Silhouette */}
      <path 
        d="M45 42 Q50 38 55 42 L58 45 L42 45 Z M42 45 H58 V48 H42 Z" 
        fill="currentColor" 
      />
      
      {/* Location Pin */}
      <circle cx="70" cy="75" r="8" fill="currentColor" />
      <circle cx="70" cy="75" r="3" fill="#080c14" />
      <path d="M70 83 L74 79 L66 79 Z" fill="currentColor" />
    </svg>
  );
}

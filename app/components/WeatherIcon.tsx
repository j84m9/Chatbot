'use client';

type WeatherType = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';

function wmoToType(code: number): WeatherType {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  return 'thunderstorm';
}

function Sun({ size, color = '#FBBF24' }: { size: number; color?: string }) {
  return (
    <g>
      <circle cx={size / 2} cy={size / 2} r={size * 0.18} fill={color} />
      <g style={{ transformOrigin: 'center', animation: 'weather-spin 12s linear infinite' }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            x1={size / 2}
            y1={size * 0.12}
            x2={size / 2}
            y2={size * 0.22}
            stroke={color}
            strokeWidth={size * 0.04}
            strokeLinecap="round"
            transform={`rotate(${angle} ${size / 2} ${size / 2})`}
          />
        ))}
      </g>
    </g>
  );
}

function Cloud({ size, x, y, scale = 1, color = 'white', opacity = 1, drift = false }: {
  size: number; x: number; y: number; scale?: number; color?: string; opacity?: number; drift?: boolean;
}) {
  return (
    <g
      transform={`translate(${x},${y}) scale(${scale})`}
      opacity={opacity}
      style={drift ? { animation: 'weather-drift 4s ease-in-out infinite' } : undefined}
    >
      <circle cx={size * 0.15} cy={size * 0.12} r={size * 0.1} fill={color} />
      <circle cx={size * 0.28} cy={size * 0.07} r={size * 0.13} fill={color} />
      <circle cx={size * 0.42} cy={size * 0.1} r={size * 0.1} fill={color} />
      <rect x={size * 0.08} y={size * 0.1} width={size * 0.4} height={size * 0.1} rx={size * 0.04} fill={color} />
    </g>
  );
}

function RainDrops({ size, count = 3, heavy = false }: { size: number; count?: number; heavy?: boolean }) {
  const drops = Array.from({ length: count }, (_, i) => ({
    x: size * 0.25 + (i * size * 0.2),
    delay: `${i * 0.3}s`,
    height: heavy ? size * 0.12 : size * 0.08,
  }));
  return (
    <g>
      {drops.map((d, i) => (
        <line
          key={i}
          x1={d.x}
          y1={size * 0.62}
          x2={d.x - size * 0.03}
          y2={size * 0.62 + d.height}
          stroke="#60A5FA"
          strokeWidth={size * 0.025}
          strokeLinecap="round"
          style={{
            animation: `weather-rain 0.8s ease-in infinite`,
            animationDelay: d.delay,
          }}
        />
      ))}
    </g>
  );
}

function SnowFlakes({ size }: { size: number }) {
  const flakes = [
    { x: size * 0.25, delay: '0s' },
    { x: size * 0.45, delay: '0.4s' },
    { x: size * 0.65, delay: '0.8s' },
  ];
  return (
    <g>
      {flakes.map((f, i) => (
        <circle
          key={i}
          cx={f.x}
          cy={size * 0.65}
          r={size * 0.03}
          fill="white"
          style={{
            animation: `weather-snow 1.5s ease-in-out infinite`,
            animationDelay: f.delay,
          }}
        />
      ))}
    </g>
  );
}

function Lightning({ size }: { size: number }) {
  return (
    <polygon
      points={`${size * 0.45},${size * 0.45} ${size * 0.4},${size * 0.62} ${size * 0.48},${size * 0.62} ${size * 0.42},${size * 0.82} ${size * 0.58},${size * 0.55} ${size * 0.5},${size * 0.55} ${size * 0.55},${size * 0.45}`}
      fill="#FBBF24"
      style={{ animation: 'weather-flash 2s ease-in-out infinite' }}
    />
  );
}

function FogLines({ size }: { size: number }) {
  return (
    <g>
      {[0.45, 0.55, 0.65].map((y, i) => (
        <line
          key={i}
          x1={size * 0.2}
          y1={size * y}
          x2={size * 0.8}
          y2={size * y}
          stroke="currentColor"
          strokeWidth={size * 0.03}
          strokeLinecap="round"
          opacity={0.4 - i * 0.1}
          style={{
            animation: 'weather-drift 3s ease-in-out infinite',
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </g>
  );
}

interface WeatherIconProps {
  weatherCode: number;
  size?: number;
  className?: string;
}

export default function WeatherIcon({ weatherCode, size = 64, className }: WeatherIconProps) {
  const type = wmoToType(weatherCode);

  return (
    <>
      <style>{`
        @keyframes weather-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes weather-drift { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(${size * 0.04}px); } }
        @keyframes weather-rain { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(${size * 0.18}px); } }
        @keyframes weather-snow { 0% { opacity: 1; transform: translateY(0) rotate(0deg); } 100% { opacity: 0; transform: translateY(${size * 0.2}px) rotate(180deg); } }
        @keyframes weather-flash { 0%, 40%, 60%, 100% { opacity: 0; } 45%, 55% { opacity: 1; } }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        className={className}
        aria-label={type}
      >
        {type === 'clear' && <Sun size={size} />}

        {type === 'partly-cloudy' && (
          <>
            <Sun size={size} />
            <Cloud size={size} x={size * 0.15} y={size * 0.3} scale={0.9} drift />
          </>
        )}

        {type === 'cloudy' && (
          <>
            <Cloud size={size} x={size * 0.05} y={size * 0.15} scale={1} color="#94A3B8" opacity={0.6} />
            <Cloud size={size} x={size * 0.15} y={size * 0.25} scale={1.1} color="#CBD5E1" drift />
          </>
        )}

        {type === 'fog' && (
          <>
            <Cloud size={size} x={size * 0.1} y={size * 0.1} scale={1} color="#CBD5E1" opacity={0.5} />
            <FogLines size={size} />
          </>
        )}

        {type === 'drizzle' && (
          <>
            <Cloud size={size} x={size * 0.15} y={size * 0.15} scale={1} color="#94A3B8" drift />
            <RainDrops size={size} count={2} />
          </>
        )}

        {type === 'rain' && (
          <>
            <Cloud size={size} x={size * 0.15} y={size * 0.15} scale={1} color="#64748B" drift />
            <RainDrops size={size} count={4} heavy />
          </>
        )}

        {type === 'snow' && (
          <>
            <Cloud size={size} x={size * 0.15} y={size * 0.15} scale={1} color="#94A3B8" drift />
            <SnowFlakes size={size} />
          </>
        )}

        {type === 'thunderstorm' && (
          <>
            <Cloud size={size} x={size * 0.15} y={size * 0.1} scale={1} color="#475569" />
            <Lightning size={size} />
            <RainDrops size={size} count={3} heavy />
          </>
        )}
      </svg>
    </>
  );
}

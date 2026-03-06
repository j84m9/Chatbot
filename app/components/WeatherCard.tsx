'use client';

import WeatherIcon from './WeatherIcon';

interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  weatherCode: number;
  description: string;
  icon: string;
}

interface ForecastDay {
  date: string;
  high: number;
  low: number;
  weatherCode: number;
  description: string;
  icon: string;
}

interface WeatherData {
  location: string;
  current: CurrentWeather;
  forecast: ForecastDay[];
  units: { temperature: string; windSpeed: string };
  error?: string;
}

interface WeatherCardProps {
  jsonString: string;
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff >= 0 && diff < 1) return 'Today';
  if (diff >= 1 && diff < 2) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function WeatherCard({ jsonString }: WeatherCardProps) {
  let data: WeatherData;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return (
      <pre className="overflow-x-auto rounded-xl p-4 text-sm dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-300 text-gray-700 border dark:border-white/[0.06] border-gray-200">
        <code>{jsonString}</code>
      </pre>
    );
  }

  if (data.error) {
    return (
      <div className="rounded-xl border dark:border-white/[0.06] border-gray-200 p-4 my-2 dark:bg-[#0d0d0e] bg-gray-50">
        <p className="text-sm dark:text-gray-400 text-gray-600">Weather data unavailable: {data.error}</p>
      </div>
    );
  }

  const { current, forecast, units, location } = data;
  const tempUnit = units.temperature;

  return (
    <div className="rounded-xl border dark:border-white/[0.06] border-gray-200 overflow-hidden my-2 max-w-md">
      {/* Current conditions */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-900 p-5 text-white">
        <p className="text-sm font-medium opacity-90 mb-1">{location}</p>
        <div className="flex items-center gap-3">
          <WeatherIcon weatherCode={current.weatherCode} size={64} className="shrink-0 text-white" />
          <div>
            <p className="text-4xl font-bold tracking-tight">
              {Math.round(current.temperature)}{tempUnit}
            </p>
            <p className="text-sm opacity-80">
              Feels like {Math.round(current.feelsLike)}{tempUnit}
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm font-medium">{current.description}</p>
      </div>

      {/* Stats */}
      <div className="flex gap-2 px-4 py-3 dark:bg-[#0d0d0e] bg-gray-50 border-b dark:border-white/[0.06] border-gray-200">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium dark:bg-white/[0.08] bg-gray-200/70 dark:text-gray-300 text-gray-700">
          💧 {current.humidity}%
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium dark:bg-white/[0.08] bg-gray-200/70 dark:text-gray-300 text-gray-700">
          💨 {current.windSpeed} {units.windSpeed} {current.windDirection}
        </span>
      </div>

      {/* 5-day forecast */}
      {forecast && forecast.length > 0 && (
        <div className="grid grid-cols-5 divide-x dark:divide-white/[0.06] divide-gray-200 dark:bg-[#0d0d0e] bg-white">
          {forecast.map((day) => (
            <div key={day.date} className="flex flex-col items-center py-3 px-1 gap-1">
              <span className="text-[10px] font-medium dark:text-gray-400 text-gray-500 uppercase">
                {formatDay(day.date)}
              </span>
              <WeatherIcon weatherCode={day.weatherCode} size={32} className="dark:text-gray-300 text-gray-600" />
              <div className="text-center">
                <span className="text-xs font-semibold dark:text-gray-200 text-gray-800">
                  {Math.round(day.high)}°
                </span>
                <span className="text-xs dark:text-gray-500 text-gray-400 ml-0.5">
                  {Math.round(day.low)}°
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

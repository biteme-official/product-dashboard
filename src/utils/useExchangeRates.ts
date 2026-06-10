import { useState, useEffect } from 'react';

const CACHE_KEY = 'exchangeRates_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

interface RateCache {
  usdKrw: number;
  jpyKrw: number;
  fetchedAt: number;
}

// API 실패 또는 캐시 없을 때 fallback
const FALLBACK: RateCache = { usdKrw: 1400, jpyKrw: 9.0, fetchedAt: 0 };

function readCache(): RateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as RateCache;
    if (Date.now() - data.fetchedAt < TTL_MS) return data;
    return null; // 만료
  } catch { return null; }
}

function writeCache(data: RateCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}

/**
 * USD/JPY → KRW 환율을 하루 1회 자동 갱신.
 * 출처: open.er-api.com (무료, 키 없음, ECB 기반, 매일 갱신)
 * 캐싱: localStorage에 24h TTL. API 실패 시 이전 캐시 또는 fallback 사용.
 */
export function useExchangeRates(): { usdKrw: number; jpyKrw: number; isLive: boolean } {
  const cached = readCache();
  const [rates, setRates] = useState<RateCache>(cached ?? FALLBACK);
  const [isLive, setIsLive] = useState(cached !== null);

  useEffect(() => {
    if (readCache()) return; // 캐시가 유효하면 요청 생략
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => r.json())
      .then((data) => {
        const krwPerUsd: number = data?.rates?.KRW;
        const jpyPerUsd: number = data?.rates?.JPY;
        if (!krwPerUsd || !jpyPerUsd) return;
        const cache: RateCache = {
          usdKrw: Math.round(krwPerUsd),
          jpyKrw: Math.round((krwPerUsd / jpyPerUsd) * 100) / 100,
          fetchedAt: Date.now(),
        };
        writeCache(cache);
        setRates(cache);
        setIsLive(true);
      })
      .catch(() => {}); // 실패 시 기존 rates 유지
  }, []);

  return { ...rates, isLive };
}

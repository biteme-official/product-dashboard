import { useCallback, useEffect, useState } from 'react';
import {
  classifyTableauError, fetchChannelShipments, fetchSkuShipments, fetchTeamCateData, invalidateCache,
  type ChannelDataMap, type SkuShipmentInfo, type TableauErrorReason, type TeamCateMap,
} from '../services/tableau';

export interface TableauBase {
  shipments: SkuShipmentInfo[];
  channelMap: ChannelDataMap | null;
  teamCate: TeamCateMap | null;
  loading: boolean;
  /** 실패한 데이터의 원인 — 없으면 null */
  errors: { shipments: TableauErrorReason | null; channel: TableauErrorReason | null; teamCate: TableauErrorReason | null };
  /** 캐시를 비우고 다시 불러온다 */
  retry: () => void;
}

/** 태블로 기본 데이터(대응SKU 실적 · 채널별 출고 · 팀카테 변동비) — 서비스에서 55분 캐시, 실패 원인을 숨기지 않는다 */
export function useTableauBase(): TableauBase {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<TableauBase, 'retry'>>({
    shipments: [], channelMap: null, teamCate: null, loading: true,
    errors: { shipments: null, channel: null, teamCate: null },
  });
  useEffect(() => {
    let alive = true;
    Promise.allSettled([fetchSkuShipments(), fetchChannelShipments(), fetchTeamCateData()]).then(([a, b, c]) => {
      if (!alive) return;
      setState({
        shipments: a.status === 'fulfilled' ? a.value : [],
        channelMap: b.status === 'fulfilled' ? b.value : null,
        teamCate: c.status === 'fulfilled' ? c.value : null,
        loading: false,
        errors: {
          shipments: a.status === 'rejected' ? classifyTableauError(a.reason) : null,
          channel: b.status === 'rejected' ? classifyTableauError(b.reason) : null,
          teamCate: c.status === 'rejected' ? classifyTableauError(c.reason) : null,
        },
      });
    });
    return () => { alive = false; };
  }, [tick]);
  const retry = useCallback(() => {
    invalidateCache();
    setState((s) => ({ ...s, loading: true }));
    setTick((t) => t + 1);
  }, []);
  return { ...state, retry };
}

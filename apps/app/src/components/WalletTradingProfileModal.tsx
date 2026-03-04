import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../api-client";

export type WalletTradingProfileModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  profile: WalletTradingProfileResponse | null;
  bnbUsdEstimate: number | null;
  windowFilter: WalletTradingProfileWindow;
  sourceFilter: WalletTradingProfileSourceFilter;
  onClose: () => void;
  onRefresh: () => void;
  onWindowFilterChange: (windowFilter: WalletTradingProfileWindow) => void;
  onSourceFilterChange: (
    sourceFilter: WalletTradingProfileSourceFilter,
  ) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** Placeholder — full implementation tracked in a follow-up PR. */
export function WalletTradingProfileModal({
  open,
}: WalletTradingProfileModalProps) {
  if (!open) return null;
  return null;
}

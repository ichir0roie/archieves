import { useEffect, useState, type DependencyList } from "react";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";

interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: ErrorDetails | null;
}

/**
 * GET の読み込みを一つの状態にまとめる。deps が変わったら読み直し、古い応答は捨てる。
 * 読み直しの間は前の data を残す(画面がちらつかない)。POST のような非冪等な処理には使わない(useRunOnce)。
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (e) => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: toErrorDetails(e) }));
      }
    );
    return () => {
      cancelled = true;
    };
    // load は呼ぶ側が毎回作り直す関数なので、依存は deps で渡させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

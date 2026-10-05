import type { ConfigValues, MiniAppReleaseAction } from "@vado/contracts";

/** Yayın geçmişindeki bir adım (`mini_app_releases`). */
export interface ReleaseStep {
  action: MiniAppReleaseAction;
  package_id: string;
  version: string;
  config: ConfigValues;
}

/** Bir an için yayında olan sürüm ve ayarlar. */
export interface ReleaseState {
  packageId: string;
  version: string;
  config: ConfigValues;
}

const stateOf = (step: ReleaseStep): ReleaseState => ({
  packageId: step.package_id,
  version: step.version,
  config: step.config,
});

/**
 * Yayın geçmişini baştan oynatır ve geri alınabilecek yayınların yığınını döndürür; yığının
 * tepesi şu an yayında olandır.
 *
 * - `publish` yığına yeni bir yayın koyar.
 * - `config` tepedeki yayının ayarlarını değiştirir.
 * - `rollback` tepedeki yayını kaldırır ve geri dönülen yayına kadar iner.
 *
 * Böylece geri alma her zaman "son yayını geri al" anlamına gelir: art arda iki geri alma iki
 * yayın geriye gider, ileri geri gidip gelmez.
 */
export function replayReleases(steps: readonly ReleaseStep[]): ReleaseState[] {
  const stack: ReleaseState[] = [];
  for (const step of steps) {
    const state = stateOf(step);
    if (step.action === "publish") {
      stack.push(state);
      continue;
    }
    if (step.action === "rollback") {
      stack.pop();
      // Geri dönülen yayın, arada onayı kalkmış sürümler atlanarak bulunmuş olabilir.
      while (stack.length > 0 && stack.at(-1)?.version !== step.version) stack.pop();
    }
    // Tepedeki yayın, adımın kaydettiği ayarlarla yeniden yazılır.
    stack.pop();
    stack.push(state);
  }
  return stack;
}

/**
 * Geri almanın döneceği yayın: şu an yayında olanın altındaki, sürümü hâlâ çalıştırılabilir olan
 * ilk yayın. Yoksa `null`.
 */
export function rollbackTarget(
  steps: readonly ReleaseStep[],
  isRunnable: (version: string) => boolean,
): ReleaseState | null {
  const stack = replayReleases(steps);
  stack.pop();
  while (stack.length > 0) {
    const candidate = stack.pop();
    if (candidate !== undefined && isRunnable(candidate.version)) return candidate;
  }
  return null;
}

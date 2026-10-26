import { useEffect, useRef, useState } from "react";
import { Action, Card, Icon } from "./components/ui";
import { draftStore, repository } from "./data/sdk";
import {
  addDays,
  effective,
  getCycleDateRange,
  localDate,
} from "./domain/calculations";
import {
  emptyWallet,
  type MealType,
  type Profile,
  type Wallet,
} from "./domain/model";
import Home from "./pages/Home";
import Records from "./pages/Records";
import My from "./pages/My";
import Onboarding from "./pages/Onboarding";
import "./App.css";
import { SafeArea, graniteEvent } from "@apps-in-toss/web-framework";
import { errorMessage } from "./domain/format";
type Tab = "home" | "meal" | "exercise" | "my";
const tabs: Record<Tab, string> = {
  home: "홈",
  meal: "식단",
  exercise: "운동",
  my: "마이",
};
export default function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("home"),
    [onboarding, setOnboarding] = useState(false),
    [date, setDate] = useState(localDate),
    [today, setToday] = useState(localDate),
    [mealType, setMealType] = useState<MealType | undefined>();
  const saving = useRef(false);
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const w = await repository.load();
      setWallet(w);
      setTab("home");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "데이터를 불러오지 못했어요",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const apply = (insets: ReturnType<typeof SafeArea.get>) => {
      const root = document.documentElement;
      root.style.setProperty("--safe-top", `${insets.top}px`);
      root.style.setProperty("--safe-bottom", `${insets.bottom}px`);
    };
    try {
      apply(SafeArea.get());
      return SafeArea.subscribe({ onEvent: apply });
    } catch {
      return;
    }
  }, []);
  useEffect(() => {
    if (onboarding) return;
    // At the root screen, keep the container's normal exit/back behavior.
    if (tab === "home") return;
    return graniteEvent.addEventListener("backEvent", {
      onEvent: () => {
        if (saving.current) return;
        const dialog = document.querySelector("dialog[open]");
        if (dialog) {
          dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          return;
        }
        setTab("home");
      },
      onError: () =>
        setError("뒤로가기를 연결하지 못했어요. 화면의 버튼을 이용해주세요."),
    });
  }, [onboarding, tab]);
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function save(next: Wallet) {
    if (saving.current)
      throw new Error("이전 저장이 끝난 뒤 다시 시도해주세요");
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await repository.save(next);
      setWallet(next);
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function changeTab(next: Tab) {
    setTab(next);
    window.scrollTo(0, 0);
  }
  function openRecords(
    kind: "meal" | "exercise",
    day: string,
    type?: MealType,
  ) {
    setDate(day);
    setMealType(type);
    changeTab(kind);
  }
  async function reset() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await repository.reset();
      setWallet(null);
      setTab("home");
      setLoadError("");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const initialized = wallet?.meta.initialized === true;
  const initial: Profile | undefined = initialized
    ? (effective(wallet.tdee_history, addDays(today, 1))?.profile ??
      wallet.profile ??
      undefined)
    : undefined;
  return (
    <main className={`app-shell${onboarding ? " onboarding-shell" : ""}`}>
      {loading ? (
        <div className="loading" role="status">
          <span className="loading-dot" />
          기록을 불러오고 있어요…
        </div>
      ) : (
        <>
          {loadError ? (
            <Card>
              <h1>기록을 불러오지 못했어요</h1>
              <p role="alert" className="error">
                {loadError}
              </p>
              <Action onClick={() => void load()}>다시 불러오기</Action>
            </Card>
          ) : onboarding ? (
            <Onboarding
              initial={initial}
              initialGoal={
                wallet ? effective(wallet.goal_history, today) : undefined
              }
              initialCycle={
                wallet ? effective(wallet.cycle_history, today) : undefined
              }
              initialCorrection={
                wallet
                  ? effective(wallet.tdee_history, addDays(today, 1))
                      ?.correction
                  : undefined
              }
              busy={busy}
              onCancel={() => setOnboarding(false)}
              onComplete={async (result) => {
                const current = wallet ?? emptyWallet(today),
                  initialStartDate = initialized
                    ? current.meta.startedOn
                    : getCycleDateRange(today, result.cycle).start,
                  from = initialized ? addDays(today, 1) : initialStartDate;
                const p = { ...result.profile };
                const next: Wallet = {
                  ...current,
                  profile: p,
                  tdee_history: [
                    ...current.tdee_history.filter(
                      (t) => t.effectiveFrom !== from,
                    ),
                    { ...result.tdee, effectiveFrom: from },
                  ],
                  goal_history: initialized
                    ? current.goal_history
                    : [{ ...result.goal, effectiveFrom: from }],
                  cycle_history: initialized
                    ? current.cycle_history
                    : [{ ...result.cycle, effectiveFrom: from }],
                  meta: {
                    ...current.meta,
                    startedOn: initialStartDate,
                    initialized: true,
                    updatedAt: new Date().toISOString(),
                  },
                };
                await save(next);
                await draftStore.clear().catch(() => undefined);
                setOnboarding(false);
                setTab("home");
                window.scrollTo(0, 0);
              }}
            />
          ) : !initialized ? (
            <div
              className="welcome"
              role="button"
              tabIndex={0}
              aria-label="아무 곳이나 터치해 시작하기"
              onClick={() => setOnboarding(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOnboarding(true);
                }
              }}
            >
              <h1>
                칼로리 잔고에
                <br />
                오신 것을 환영해요
              </h1>
              <p className="hint welcome-prompt">아무 곳이나 터치</p>
              <p className="hint welcome-device-note">
                로그인 없이 시작해요. 기록은 기기에만 저장돼요.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {tab === "home" && (
                <Home
                  key={today}
                  wallet={wallet}
                  openRecords={openRecords}
                  today={today}
                />
              )}
              {(tab === "meal" || tab === "exercise") && (
                <Records
                  key={tab}
                  wallet={wallet}
                  kind={tab}
                  date={date}
                  setDate={setDate}
                  mealType={mealType}
                  save={save}
                  busy={busy}
                />
              )}
              {tab === "my" && (
                <My
                  wallet={wallet}
                  save={save}
                  busy={busy}
                  recalculate={() => {
                    setOnboarding(true);
                    window.scrollTo(0, 0);
                  }}
                  reset={reset}
                />
              )}
              <nav className="floating-tabs" aria-label="주 메뉴">
                {(Object.entries(tabs) as [Tab, string][]).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      aria-current={tab === key ? "page" : undefined}
                      className={tab === key ? "active" : ""}
                      onClick={() => {
                        // The exercise tab may retain a past date after browsing
                        // records. Entering it from Home should use today's date
                        // so its workout choice updates today's Home summary.
                        if (tab === "home" && key === "exercise") {
                          setDate(today);
                        }
                        setMealType(undefined);
                        changeTab(key);
                      }}
                    >
                      <Icon name={key} />
                      <span>{label}</span>
                    </button>
                  ),
                )}
              </nav>
            </>
          )}
        </>
      )}
    </main>
  );
}

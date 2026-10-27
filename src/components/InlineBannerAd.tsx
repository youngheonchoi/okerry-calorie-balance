import { useEffect, useRef, useState } from "react";
import { TossAds } from "@apps-in-toss/web-framework";
import { bannerAdGroupId } from "../config/ads";
import { initializeBannerAds } from "../data/bannerAds";

export default function InlineBannerAd({ placement }: { placement: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const scrollArea = target.current?.closest(".tab-content-scroll");
    const content = target.current?.closest(".tab-content-inner");
    const update = () =>
      setScrollable(
        !!scrollArea && scrollArea.scrollHeight > scrollArea.clientHeight + 1,
      );
    const observer = new ResizeObserver(update);
    if (scrollArea) observer.observe(scrollArea);
    if (content) observer.observe(content);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!scrollable || !bannerAdGroupId) return;
    let disposed = false;
    let failed = false;
    let slot: ReturnType<typeof TossAds.attachBanner> | undefined;
    const unavailable = () => {
      failed = true;
      if (!disposed) setRendered(false);
      slot?.destroy();
    };
    void initializeBannerAds().then((ready) => {
      if (!ready || disposed || !target.current) return;
      try {
        slot = TossAds.attachBanner(bannerAdGroupId, target.current, {
          theme: "light",
          tone: "blackAndWhite",
          variant: "card",
          callbacks: {
            onAdRendered: () => {
              if (!disposed && !failed) setRendered(true);
            },
            onNoFill: unavailable,
            onAdFailedToRender: unavailable,
          },
        });
        if (failed) slot.destroy();
      } catch {
        unavailable();
      }
    });
    return () => {
      disposed = true;
      slot?.destroy();
      setRendered(false);
    };
  }, [scrollable]);

  return (
    <aside
      className={`inline-banner${rendered ? " is-rendered" : ""}`}
      data-placement={placement}
      aria-label="광고"
      aria-hidden={!rendered}
    >
      <div className="inline-banner-target" ref={target} />
    </aside>
  );
}

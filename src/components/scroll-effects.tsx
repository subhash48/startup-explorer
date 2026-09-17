"use client";
import { useEffect } from "react";

export default function ScrollEffects({ revision }: { revision: string }) {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations: Animation[] = [];
    let observer: IntersectionObserver | undefined;
    function observe() {
      observer?.disconnect();
      animations.forEach((animation) => animation.cancel());
      if (preference.matches || !window.IntersectionObserver) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const target = entry.target as HTMLElement;
            // Content stays visible when JavaScript, observers, or animations are unavailable.
            if (target.animate)
              animations.push(
                target.animate(
                  [
                    { opacity: 0.15, transform: "translateY(22px)" },
                    { opacity: 1, transform: "translateY(0)" },
                  ],
                  { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" },
                ),
              );
            observer?.unobserve(target);
          }
        },
        { threshold: 0.08 },
      );
      document
        .querySelectorAll(
          "[data-reveal], .report-grid > .card, .contact-card, .feature-grid article",
        )
        .forEach((element) => observer?.observe(element));
    }
    observe();
    preference.addEventListener("change", observe);
    return () => {
      observer?.disconnect();
      animations.forEach((animation) => animation.cancel());
      preference.removeEventListener("change", observe);
    };
  }, [revision]);
  return <div className="reading-progress" aria-hidden="true" />;
}

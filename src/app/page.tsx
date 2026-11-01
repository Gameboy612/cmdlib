import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { LoopSection } from "@/components/landing/LoopSection";
import { LiveStage } from "@/components/landing/LiveStage";
import { WorkbenchSection } from "@/components/landing/WorkbenchSection";
import { VersionSection } from "@/components/landing/VersionSection";
import { LintSection } from "@/components/landing/LintSection";
import { CloseSection } from "@/components/landing/CloseSection";
import { SiteFooter } from "@/components/landing/SiteFooter";

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      <Hero />
      <LoopSection />
      <LiveStage />
      <WorkbenchSection />
      <VersionSection />
      <LintSection />
      <CloseSection />
      <SiteFooter />
    </main>
  );
}

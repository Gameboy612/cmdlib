import Link from "next/link";
import styles from "./landing.module.css";
import { asset } from "@/lib/base-path";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <img src={asset("/art/mark.svg")} alt="" width={34} height={34} />
          <div>
            <strong>cmdlib</strong>
            <p>A datapack IDE that runs in the tab.</p>
          </div>
        </div>

        <div className={styles.footerCols}>
          <div>
            <span>Product</span>
            <Link href="/editor/">Editor</Link>
            <a href="#run">Live runtime</a>
            <a href="#versions">Versions</a>
          </div>
          <div>
            <span>Trust</span>
            <Link href="/credits/">Credits & licenses</Link>
            <a href="https://minecraft.wiki/w/Data_pack" target="_blank" rel="noreferrer">Data pack reference</a>
            <a href="https://github.com/SpyglassMC/Spyglass" target="_blank" rel="noreferrer">Spyglass</a>
          </div>
          <div>
            <span>Status</span>
            <p className={styles.footerStatus}><span className="dot" /> static · local-only</p>
            <p>26.3 profile</p>
            <p>no telemetry</p>
          </div>
        </div>
      </div>

      <div className={`container ${styles.footerLegal}`}>
        <p>
          cmdlib is an independent tool. Not affiliated with Mojang Studios or
          Microsoft. Minecraft is a trademark of Mojang Synergies AB.
        </p>
        <p>
          Built with Next.js, CodeMirror, dockview and the Minecraft community&apos;s
          documentation. <Link href="/credits/">Full notices</Link>.
        </p>
      </div>

      <div className={styles.footerWord} aria-hidden>
        cmdlib
      </div>
    </footer>
  );
}

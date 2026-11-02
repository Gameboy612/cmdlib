"use client";

import { useMemo } from "react";
import { useSimRevision, useWorkbench } from "@/lib/state/workbench";
import type { InventoryItem } from "@/lib/mc/player";
import { formatSlot, itemComponentSummary } from "@/lib/mc/items";
import styles from "./inventory.module.css";

function ItemBox({
  item,
  slot,
  active = false,
}: {
  item?: InventoryItem;
  slot: string;
  active?: boolean;
}) {
  const name = item?.id.replace(/^minecraft:/, "") ?? "";
  return (
    <div
      className={`${styles.itemBox} ${item ? styles.itemFilled : ""} ${active ? styles.itemActive : ""}`}
      title={item ? `${item.id}\n${slot}${item.components ? `\ncomponents: ${itemComponentSummary(item)}` : ""}` : slot}
    >
      <span className={styles.itemGlyph}>
        {item ? name.slice(0, 2).toUpperCase() : "·"}
      </span>
      {item && item.count > 1 && <b className={styles.itemCount}>{item.count}</b>}
      {item?.components && Object.keys(item.components).length > 0 && (
        <span className={styles.itemComponentDot} />
      )}
    </div>
  );
}

export function InventoryPanel() {
  const sim = useWorkbench((state) => state.sim);
  const revision = useSimRevision();
  const world = sim.world;
  const player = world.player() ?? null;
  const health = world.playerHealth(player);
  const maxHealth = 20;
  const selected = world.playerSelectedSlot(player);
  const hotbar = useMemo(
    () => Array.from({ length: 9 }, (_, i) => world.getItemAt(player, `hotbar.${i}`)),
    [world, player, revision],
  );
  const main = useMemo(
    () => Array.from({ length: 27 }, (_, i) => world.getItemAt(player, `inventory.${i}`)),
    [world, player, revision],
  );
  const ender = useMemo(
    () => Array.from({ length: 27 }, (_, i) => world.getItemAt(player, `enderchest.${i}`)),
    [world, player, revision],
  );
  const mainhand = world.getItemAt(player, "weapon.mainhand");
  const offhand = world.getItemAt(player, "weapon.offhand");
  const armor = ["armor.head", "armor.chest", "armor.legs", "armor.feet"].map((slot) => ({
    slot,
    item: world.getItemAt(player, slot),
  }));

  return (
    <div className={styles.panel} aria-label="Player inventory">
      <div className={styles.bar}>
        <span className={styles.title}>Inventory</span>
        <span className={styles.healthLabel}>
          ♥ {health.toFixed(0)} / {maxHealth}
        </span>
        <span className={styles.barRight}>{selected >= 0 ? `hotbar ${selected + 1}` : "no player"}</span>
      </div>
      <div className={styles.healthTrack}>
        <span style={{ width: `${Math.max(0, Math.min(100, (health / maxHealth) * 100))}%` }} />
      </div>
      <div className={styles.body}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span>Held</span>
            <span>{world.playerGameMode()}</span>
          </div>
          <div className={styles.heldRow}>
            <div className={styles.heldSlot}>
              <span className={styles.slotLabel}>mainhand</span>
              <ItemBox item={mainhand} slot="weapon.mainhand" active />
            </div>
            <div className={styles.heldSlot}>
              <span className={styles.slotLabel}>offhand</span>
              <ItemBox item={offhand} slot="weapon.offhand" />
            </div>
            <div className={styles.armorRow}>
              {armor.map(({ slot, item }) => (
                <div className={styles.heldSlot} key={slot}>
                  <span className={styles.slotLabel}>{formatSlot(slot)}</span>
                  <ItemBox item={item} slot={slot} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span>Hotbar</span>
            <span>inventory slots</span>
          </div>
          <div className={styles.hotbar}>
            {hotbar.map((item, index) => (
              <ItemBox key={index} item={item} slot={`hotbar.${index}`} active={index === selected} />
            ))}
          </div>
          <div className={styles.inventoryGrid}>
            {main.map((item, index) => (
              <ItemBox key={index} item={item} slot={`inventory.${index}`} />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span>Ender chest</span>
            <span>enderchest slots</span>
          </div>
          <div className={styles.enderGrid}>
            {ender.map((item, index) => (
              <ItemBox key={index} item={item} slot={`enderchest.${index}`} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default InventoryPanel;

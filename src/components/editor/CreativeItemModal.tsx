"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { parseItemComponents } from "@/lib/mc/items";
import styles from "./creative.module.css";

const COMMON_ITEMS = [
  "minecraft:stone", "minecraft:dirt", "minecraft:grass_block", "minecraft:cobblestone",
  "minecraft:oak_planks", "minecraft:oak_log", "minecraft:glass", "minecraft:sand",
  "minecraft:diamond_block", "minecraft:iron_block", "minecraft:gold_block",
  "minecraft:emerald_block", "minecraft:redstone_block", "minecraft:command_block",
  "minecraft:barrier", "minecraft:light", "minecraft:chest", "minecraft:barrel",
  "minecraft:diamond", "minecraft:emerald", "minecraft:iron_ingot", "minecraft:gold_ingot",
  "minecraft:netherite_ingot", "minecraft:stick", "minecraft:coal", "minecraft:redstone",
  "minecraft:lapis_lazuli", "minecraft:quartz", "minecraft:amethyst_shard",
  "minecraft:diamond_sword", "minecraft:netherite_sword", "minecraft:bow",
  "minecraft:crossbow", "minecraft:trident", "minecraft:shield", "minecraft:elytra",
  "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe", "minecraft:diamond_axe",
  "minecraft:shears", "minecraft:fishing_rod", "minecraft:flint_and_steel",
  "minecraft:written_book", "minecraft:writable_book", "minecraft:knowledge_book",
  "minecraft:ender_pearl", "minecraft:ender_eye", "minecraft:totem_of_undying",
  "minecraft:golden_apple", "minecraft:enchanted_golden_apple", "minecraft:potion",
  "minecraft:splash_potion", "minecraft:lingering_potion", "minecraft:milk_bucket",
  "minecraft:water_bucket", "minecraft:lava_bucket", "minecraft:oak_boat",
  "minecraft:minecart", "minecraft:hopper", "minecraft:observer", "minecraft:piston",
  "minecraft:sticky_piston", "minecraft:redstone_torch", "minecraft:repeater",
  "minecraft:comparator", "minecraft:target", "minecraft:beacon", "minecraft:conduit",
  "minecraft:spawner", "minecraft:end_portal_frame", "minecraft:dragon_egg",
];

export function CreativeItemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const showToast = useWorkbench((state) => state.showToast);
  const [item, setItem] = useState("minecraft:stone");
  const [count, setCount] = useState("1");
  const [components, setComponents] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 25);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const give = () => {
    const id = item.trim();
    const amount = Number(count);
    if (!/^[a-z0-9_.-]+(:[a-z0-9_./-]+)?$/i.test(id)) {
      setError("Enter a valid item id, for example minecraft:diamond_sword.");
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
      setError("Count must be an integer from 1 to 9,999.");
      return;
    }
    let componentText = components.trim();
    if (componentText) {
      if (!componentText.startsWith("[")) componentText = `[${componentText}]`;
      if (!componentText.endsWith("]")) componentText = `${componentText}]`;
    }
    setError(null);
    const state = useWorkbench.getState();
    const player = state.sim.world.player();
    if (!player) {
      setError("No player is available in the simulation.");
      return;
    }
    // Creative inventory access is not a command and does not require op.
    state.sim.world.givePlayerItem(
      player,
      id.includes(":") ? id : `minecraft:${id}`,
      amount,
      undefined,
      componentText ? parseItemComponents(componentText) : undefined,
    );
    state.sim.world.log("success", `Creative: gave ${amount} ${id} to ${player.username ?? "player"}`);
    state.sim.touch();
    showToast(`Gave ${amount} ${id}`, "success");
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Give creative item">
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Creative inventory</span>
            <h2>Give item</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Item type</span>
            <input
              ref={inputRef}
              value={item}
              onChange={(event) => setItem(event.target.value)}
              list="creative-item-ids"
              spellCheck={false}
              autoComplete="off"
              placeholder="minecraft:diamond_sword"
            />
            <datalist id="creative-item-ids">
              {COMMON_ITEMS.map((id) => <option key={id} value={id} />)}
            </datalist>
            <em>Any item id works. Start typing or pick a common item.</em>
          </label>

          <label className={styles.field}>
            <span>Count</span>
            <input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Components</span>
            <textarea
              value={components}
              onChange={(event) => setComponents(event.target.value)}
              spellCheck={false}
              rows={3}
              placeholder={'custom_data={set_color_book:true}, item_name="My book"'}
            />
            <em>Optional component list. Brackets are added automatically.</em>
          </label>

          <div className={styles.preview}>
            <span>preview</span>
            <code>
              /give @s {item || "minecraft:stone"}
              {components.trim() ? `[${components.trim().replace(/^\[|\]$/g, "")}]` : ""}{" "}
              {count || "1"}
            </code>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          <span>Works in creative without operator permissions.</span>
          <div>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.give} onClick={give}>Give item</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

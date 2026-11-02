"use client";

import { useMemo, useState } from "react";
import { useSimRevision, useWorkbench } from "@/lib/state/workbench";
import type { InventoryItem } from "@/lib/mc/player";
import { formatSlot, itemComponentSummary } from "@/lib/mc/items";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "@/components/ui/ContextMenu";
import { Tag } from "@/lib/mc/nbt";
import { NbtTree } from "./NbtTree";
import styles from "./inventory.module.css";

function ItemBox({
  item,
  slot,
  active = false,
  onContextMenu,
}: {
  item?: InventoryItem;
  slot: string;
  active?: boolean;
  onContextMenu?: (event: React.MouseEvent, item: InventoryItem, slot: string) => void;
}) {
  const name = item?.id.replace(/^minecraft:/, "") ?? "";
  return (
    <div
      className={`${styles.itemBox} ${item ? styles.itemFilled : ""} ${active ? styles.itemActive : ""}`}
      title={item ? `${item.id}\n${slot}${item.components ? `\ncomponents: ${itemComponentSummary(item)}` : ""}` : slot}
      onContextMenu={(event) => {
        if (!item || !onContextMenu) return;
        event.preventDefault();
        onContextMenu(event, item, slot);
      }}
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
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [book, setBook] = useState<{ slot: string; item: InventoryItem; writable: boolean } | null>(null);
  const [pageText, setPageText] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [componentsItem, setComponentsItem] = useState<{ slot: string; item: InventoryItem } | null>(null);
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

  const itemMenu = (event: React.MouseEvent, item: InventoryItem, slot: string) => {
    const isBook = item.id === "minecraft:writable_book" || item.id === "minecraft:written_book";
    const writable = item.id === "minecraft:writable_book";
    const isArmor = /(helmet|chestplate|leggings|boots)$/.test(item.id);
    const entries: ContextMenuEntry[] = [
      {
        label: isBook ? (writable ? "Edit book" : "Open book") : "Use item",
        onSelect: () => {
          if (isBook) {
            const component = item.components?.[
              writable ? "minecraft:writable_book_content" : "minecraft:written_book_content"
            ];
            let pages: string[] = [];
            if (component?.type === "compound") {
              const pageTag = component.value.pages;
              if (pageTag?.type === "list") {
                pages = pageTag.value.map((page) => (page.type === "string" ? page.value : ""));
              }
            }
            setPageText(pages[0] ?? "");
            setBookTitle(
              !writable &&
              item.components?.["minecraft:written_book_content"]?.type === "compound" &&
              item.components["minecraft:written_book_content"].value.title?.type === "compound" &&
              item.components["minecraft:written_book_content"].value.title.value.raw?.type === "string"
                ? item.components["minecraft:written_book_content"].value.title.value.raw.value
                : "",
            );
            setBook({ slot, item, writable });
            return;
          }
          const result = world.useItem(player, slot);
          if (result.kind !== "book") {
            useWorkbench.getState().showToast(result.message, result.kind === "used" ? "success" : "info");
          }
        },
      },
    ];
    if (isArmor) {
      entries.push({
        label: "Equip",
        onSelect: () => {
          const result = world.equipItem(player, slot);
          useWorkbench.getState().showToast(result.message, result.ok ? "success" : "info");
        },
      });
    }
    entries.push(
      { separator: true },
      {
        label: "Drop one",
        onSelect: () => {
          const result = world.dropItem(player, slot, 1);
          useWorkbench.getState().showToast(result.message, result.ok ? "success" : "info");
        },
      },
      {
        label: "Delete stack",
        danger: true,
        onSelect: () => {
          world.deleteItem(player, slot);
          useWorkbench.getState().showToast(`Deleted ${item.id.replace("minecraft:", "")}`, "info");
        },
      },
      { separator: true },
      {
      label: "Inspect components",
      disabled: !item.components,
      onSelect: () => setComponentsItem({ slot, item }),
    });
    setMenu({ x: event.clientX, y: event.clientY, items: entries });
  };

  const saveBook = () => {
    if (!book) return;
    const next: InventoryItem = {
      ...book.item,
      components: { ...(book.item.components ?? {}) },
    };
    const key = book.writable
      ? "minecraft:writable_book_content"
      : "minecraft:written_book_content";
    next.components![key] = Tag.compound({
      pages: Tag.list([Tag.string(pageText)], "string"),
    });
    world.setItemAt(player, book.slot, next);
    world.touch();
    useWorkbench.getState().showToast("Book updated", "success");
    setBook(null);
  };

  const signBook = () => {
    if (!book || !book.writable) return;
    const title = bookTitle.trim();
    if (!title) {
      useWorkbench.getState().showToast("A book title is required", "error");
      return;
    }
    const author = player?.username ?? "Dev";
    const next: InventoryItem = {
      ...book.item,
      id: "minecraft:written_book",
      components: { ...(book.item.components ?? {}) },
    };
    delete next.components!["minecraft:writable_book_content"];
    next.components!["minecraft:written_book_content"] = Tag.compound({
      pages: Tag.list([Tag.string(pageText)], "string"),
      title: Tag.compound({ raw: Tag.string(title) }),
      author: Tag.string(author),
      generation: Tag.int(0),
    });
    world.setItemAt(player, book.slot, next);
    world.touch();
    useWorkbench.getState().showToast(`Signed "${title}"`, "success");
    setBook(null);
  };

  const withMenu = (item: InventoryItem | undefined, slot: string, active = false) => (
    <ItemBox item={item} slot={slot} active={active} onContextMenu={itemMenu} />
  );

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
              {withMenu(mainhand, "weapon.mainhand", true)}
            </div>
            <div className={styles.heldSlot}>
              <span className={styles.slotLabel}>offhand</span>
              {withMenu(offhand, "weapon.offhand")}
            </div>
            <div className={styles.armorRow}>
              {armor.map(({ slot, item }) => (
                <div className={styles.heldSlot} key={slot}>
                  <span className={styles.slotLabel}>{formatSlot(slot)}</span>
                  {withMenu(item, slot)}
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
              <div key={index}>{withMenu(item, `hotbar.${index}`, index === selected)}</div>
            ))}
          </div>
          <div className={styles.inventoryGrid}>
            {main.map((item, index) => (
              <div key={index}>{withMenu(item, `inventory.${index}`)}</div>
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
              <div key={index}>{withMenu(item, `enderchest.${index}`)}</div>
            ))}
          </div>
        </section>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      {componentsItem && (
        <div className={styles.modalBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setComponentsItem(null);
        }}>
          <div className={styles.componentsModal} role="dialog" aria-label="Item components">
            <div className={styles.componentsHead}>
              <div>
                <span className={styles.componentsTitle}>{componentsItem.item.id}</span>
                <span className={styles.componentsSlot}>{componentsItem.slot}</span>
              </div>
              <button type="button" onClick={() => setComponentsItem(null)} aria-label="Close components">×</button>
            </div>
            <div className={styles.componentsBody}>
              <NbtTree
                tag={Tag.compound(componentsItem.item.components ?? {})}
                name="components"
                defaultOpen={3}
              />
            </div>
            <div className={styles.componentsFoot}>
              {Object.keys(componentsItem.item.components ?? {}).length} component
              {Object.keys(componentsItem.item.components ?? {}).length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}
      {book && (
        <div className={styles.modalBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBook(null);
        }}>
          <div className={styles.bookModal} role="dialog" aria-label={book.writable ? "Edit book" : "Book"}>
            <div className={styles.bookHead}>
              <span>{book.writable ? "Writable book" : "Written book"}</span>
              <button type="button" onClick={() => setBook(null)} aria-label="Close book">×</button>
            </div>
            {book.writable ? (
              <input
                className={styles.bookTitle}
                value={bookTitle}
                onChange={(event) => setBookTitle(event.target.value)}
                placeholder="Book title"
                aria-label="Book title"
                maxLength={32}
              />
            ) : (
              bookTitle && <div className={styles.bookSignedTitle}>{bookTitle}</div>
            )}
            <textarea
              value={pageText}
              readOnly={!book.writable}
              onChange={(event) => setPageText(event.target.value)}
              placeholder={book.writable ? "Write a page…" : ""}
              aria-label="Book page"
            />
            <div className={styles.bookActions}>
              <span>{book.writable ? "Editing page 1" : "Page 1"}</span>
              {book.writable && (
                <>
                  <button type="button" onClick={saveBook}>Save page</button>
                  <button type="button" onClick={signBook} disabled={!bookTitle.trim()}>Sign book</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPanel;

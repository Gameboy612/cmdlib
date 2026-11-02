import { describe, expect, it } from "vitest";
import { createDemoProject } from "./fixtures";
import { Simulator } from "../simulator";

function project() {
  const p = createDemoProject("26.3");
  p.files["data/test/item_modifier/five.json"] = JSON.stringify({
    function: "minecraft:set_count",
    count: 5,
  });
  p.files["data/test/item_modifier/named.json"] = JSON.stringify({
    function: "minecraft:set_name",
    name: { text: "Renamed", color: "gold" },
  });
  return p;
}

describe("items, components and health", () => {
  it("gives component-bearing items and stores slots", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand('give @s written_book[custom_data={set_color_book:true}] 2');
    const inventory = sim.world.playerInventory(sim.world.player()!);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].id).toBe("minecraft:written_book");
    expect(inventory[0].count).toBe(2);
    expect(inventory[0].components?.["minecraft:custom_data"]).toBeDefined();
    expect(inventory[0].slot).toBe("hotbar.0");
  });

  it("replaces and modifies slots", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    const replace = sim.runCommand(
      'item replace entity @s weapon.mainhand with diamond_sword[custom_data={tag:"x"}] 1',
    );

    const sword = sim.world.getItemAt(sim.world.player()!, "weapon.mainhand");
    expect(sword?.id).toBe("minecraft:diamond_sword");
    expect(sword?.components?.["minecraft:custom_data"]).toBeDefined();
    sim.runCommand("item modify entity @s weapon.mainhand test:five");
    expect(sim.world.getItemAt(sim.world.player()!, "weapon.mainhand")?.count).toBe(5);
    sim.runCommand("item modify entity @s weapon.mainhand test:named");
    expect(
      sim.world.getItemAt(sim.world.player()!, "weapon.mainhand")?.components?.[
        "minecraft:item_name"
      ],
    ).toBeDefined();
  });

  it("supports ender chests and damage", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand("item replace entity @s enderchest.0 with carrot_on_a_stick 1");
    expect(sim.world.getItemAt(sim.world.player()!, "enderchest.0")?.id).toBe(
      "minecraft:carrot_on_a_stick",
    );
    expect(sim.world.playerHealth()).toBe(20);
    sim.runCommand("damage @s 5");
    expect(sim.world.playerHealth()).toBe(15);
  });
});

describe("right-click item behavior", () => {
  it("consumes food and opens books", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand("give @s apple 2");
    const player = sim.world.player()!;
    const result = sim.world.useItem(player, "weapon.mainhand");
    expect(result.kind).toBe("used");
    expect(sim.world.getItemAt(player, "weapon.mainhand")?.count).toBe(1);
    sim.runCommand("give @s written_book 1");
    // written book is in the next free hotbar slot
    expect(sim.world.useItem(player, "hotbar.1").kind).toBe("book");
  });

  it("equips armor into the matching slot", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand("item replace entity @s weapon.mainhand with diamond_helmet 1");
    const player = sim.world.player()!;
    expect(sim.world.equipItem(player, "weapon.mainhand").ok).toBe(true);
    expect(sim.world.getItemAt(player, "armor.head")?.id).toBe("minecraft:diamond_helmet");
    expect(sim.world.getItemAt(player, "weapon.mainhand")).toBeUndefined();
  });
});

describe("execute if items", () => {
  it("tests item ids and component predicates in slots", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand('give @s written_book[custom_data={set_color_book:true}] 1');
    expect(
      sim.runCommand(
        'execute if items entity @s weapon.mainhand written_book[custom_data={set_color_book:true}] run say MATCH',
      ).success,
    ).toBe(true);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("MATCH")),
    ).toBe(true);
    expect(
      sim.runCommand(
        'execute if items entity @s hotbar.* written_book run say RANGE',
      ).success,
    ).toBe(true);
    expect(
      sim.runCommand(
        'execute if items entity @s weapon.mainhand diamond run say NO',
      ).success,
    ).toBe(false);
  });
});

describe("inventory NBT", () => {
  it("mirrors inventory and ender chest into player NBT", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand('give @s written_book[custom_data={set_color_book:true}] 2');
    sim.runCommand("item replace entity @s enderchest.4 with diamond 12");
    const player = sim.world.player()!;
    const inventory = player.nbt.value.Inventory;
    expect(inventory?.type).toBe("list");
    if (inventory?.type === "list") expect(inventory.value).toHaveLength(1);
    expect(sim.runCommand("data get entity @s Inventory[0].id").ok).toBe(true);
    expect(sim.runCommand("data get entity @s EnderItems[0].id").ok).toBe(true);
    expect(sim.runCommand("data get entity @s SelectedItemSlot").ok).toBe(true);
    expect(sim.runCommand("data get entity @s SelectedItem.id").ok).toBe(true);
    const mod = sim.runCommand("data modify entity @s Inventory[0].count set value 5");
    console.log("MOD", mod, JSON.stringify(player.nbt.value.Inventory), JSON.stringify(sim.world.playerInventory(player)));
    expect(sim.world.getItemAt(player, "hotbar.0")?.count).toBe(5);
    sim.runCommand("data modify entity @s SelectedItem.count set value 7");
    expect(sim.world.getItemAt(player, "hotbar.0")?.count).toBe(7);
  });
});

describe("dropping and deleting items", () => {
  it("drops one item as an entity and deletes the remaining stack", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand("give @s apple 2");
    const player = sim.world.player()!;
    expect(sim.world.dropItem(player, "weapon.mainhand", 1).ok).toBe(true);
    expect(sim.world.getItemAt(player, "weapon.mainhand")?.count).toBe(1);
    expect(
      sim.world.entities.some((entity) => entity.type === "minecraft:item"),
    ).toBe(true);
    expect(sim.world.deleteItem(player, "weapon.mainhand")).toBe(true);
    expect(sim.world.getItemAt(player, "weapon.mainhand")).toBeUndefined();
  });
});

describe("clear item predicates", () => {
  it("matches component subsets", () => {
    const sim = new Simulator({ project: project() });
    sim.reset();
    sim.runCommand(
      'give @s written_book[custom_data={set_color_book:true},item_name={text:"Signed"}] 1',
    );
    expect(
      sim.runCommand(
        "clear @s written_book[minecraft:custom_data={set_color_book:true}]",
      ).result,
    ).toBe(1);
    expect(sim.world.playerInventory(sim.world.player()!)).toHaveLength(0);
  });
});

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

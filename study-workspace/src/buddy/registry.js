import { createBuddyPackRegistry } from "./pack-model.js";

const modules = import.meta.glob("./packs/*.js", { eager: true, import: "default" });

export const buddyPackRegistry = createBuddyPackRegistry(Object.values(modules));

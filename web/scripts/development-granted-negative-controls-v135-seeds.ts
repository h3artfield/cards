/**
 * Negative granted-classifier development controls (v1.35).
 * selectionRule primary fragment MUST resolve in catalog oracle text.
 */
export type GrantedNegativeControlSeed = {
  cardName: string;
  category: string;
  /** Primary fragment before em-dash MUST be exact catalog substring */
  selectionRule: string;
};

export const GRANTED_NEGATIVE_CONTROLS_V135: GrantedNegativeControlSeed[] = [
  { cardName: "Static Orb", category: "static_restriction", selectionRule: "players can't untap more than two permanents — static restriction" },
  { cardName: "Storm Crow", category: "card_native_creature", selectionRule: "Flying (This creature can't be blocked — flying reminder" },
  { cardName: "Sensory Deprivation", category: "enchant_buff", selectionRule: "Enchanted creature gets -3/-0 — buff not grant" },
  { cardName: "Walking Sponge", category: "activated_native", selectionRule: "Target creature loses your choice of flying — native activated" },
  { cardName: "Ravnica at War", category: "instant_exile", selectionRule: "Exile all multicolored permanents — no grant" },
  { cardName: "Wyluli Wolf", category: "activated_buff", selectionRule: "Target creature gets +1/+1 until end of turn — buff not grant" },
  { cardName: "Torrent of Fire", category: "instant_damage", selectionRule: "Torrent of Fire deals damage to any target — no grant" },
  { cardName: "Waterknot", category: "aura_native", selectionRule: "Enchanted creature doesn't untap during its controller's untap step — no grant" },
  { cardName: "Palinchron", category: "triggered_native", selectionRule: "When this creature enters, untap up to seven lands — triggered" },
  { cardName: "Disposal Mummy", category: "triggered_native", selectionRule: "When this creature enters, exile target card from an opponent's graveyard — triggered" },
  { cardName: "Wei Strike Force", category: "card_native_creature", selectionRule: "Horsemanship (This creature can't be blocked — reminder" },
  { cardName: "Hua Tuo, Honored Physician", category: "activated_native", selectionRule: "Put target creature card from your graveyard on top of your library — activated" },
  { cardName: "Munitions Enthusiast", category: "triggered_native", selectionRule: "When this creature dies, it deals 1 damage to any target — triggered" },
  { cardName: "Pteramander", category: "activated_native", selectionRule: "Adapt 4. This ability costs {1} less to activate — adapt activated" },
  { cardName: "Phyrexian Broodstar", category: "static_native", selectionRule: "Affinity for Phyrexians — static not grant" },
];

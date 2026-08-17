export type DsPowerIndicatorColor = "off" | "green" | "orange" | "red";

/**
 * The DS Lite's normal state is a green power LED. Returning visitors get a
 * deliberately rare hardware quirk: red while on, orange while off. Keeping
 * the branches separate prevents one state from influencing the other.
 */
export function powerIndicatorColorFor(
  powered: boolean,
  returningVisitor: boolean,
  random: () => number = Math.random,
): DsPowerIndicatorColor {
  if (powered) return returningVisitor && random() < 1 / 20 ? "red" : "green";
  return returningVisitor && random() < 1 / 10 ? "orange" : "off";
}

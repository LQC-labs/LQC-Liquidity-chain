import { POSITION_PROFILE } from "./mobile-testnet-position-config.js";
import { createMobilePositionPage } from "./mobile-testnet-position-page.js";
export const page=createMobilePositionPage({kind:"exit",profile:POSITION_PROFILE});
page.mount();

import { registerActionContract } from "../registry";
import { quickRestyleContract } from "./quick-restyle";
import { startCompleteCampaignContract } from "./start-complete-campaign";

registerActionContract(quickRestyleContract);
registerActionContract(startCompleteCampaignContract);

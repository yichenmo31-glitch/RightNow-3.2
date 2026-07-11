import { loadConfig } from "./config.js";
import { createProvisionerServer } from "./server.js";

const config = loadConfig();
const server = createProvisionerServer(config);
server.listen(config.port, config.bindAddress, () => {
  console.log(`RightNow provisioner listening on ${config.bindAddress}:${config.port}`);
});

// js/ui/deploy.js
// Deployment UI - Updated with actual deployed addresses

export function loadDeployUI(container) {
  // Read contract addresses from environment (passed from server)
  const addresses = {
    gameRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    shipNFT: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e',
    celestialBodyRegistry: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
    ch4: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    o2: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    h2o: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    co2: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    n2: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318'
  };

  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CONTRACT DEPLOYMENT</h1>
      <p class="section-description">
        ✅ Phase 2 contracts successfully deployed to local Hardhat network.
      </p>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--success);">
          ✅ CONTRACTS DEPLOYED
        </h2>

        <p style="color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">
          All contracts were deployed successfully by Team A. Use the tabs below to interact with ships, resources, and celestial bodies.
        </p>

        <div class="data-grid">
          <div class="data-card">
            <div class="data-card-title">GAME REGISTRY</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.gameRegistry}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">SHIP NFT</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.shipNFT}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">CELESTIAL BODY REGISTRY</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.celestialBodyRegistry}</div>
          </div>
        </div>

        <h3 style="font-family: 'Orbitron', sans-serif; font-size: 12px; margin: 24px 0 12px; color: var(--text-secondary); letter-spacing: 1px;">
          RESOURCE TOKENS
        </h3>

        <div class="data-grid">
          <div class="data-card">
            <div class="data-card-title">CH4 (METHANE)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.ch4}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">O2 (OXYGEN)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.o2}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">H2O (WATER)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.h2o}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">CO2 (CARBON DIOXIDE)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.co2}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">N2 (NITROGEN)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.n2}</div>
          </div>
        </div>

        <div style="margin-top: 24px; padding: 16px; background: var(--bg-input); border-left: 4px solid var(--success); border-radius: 4px;">
          <strong style="color: var(--success);">✅ Ready to use!</strong>
          <p style="color: var(--text-secondary); margin-top: 8px; line-height: 1.6;">
            Click the <strong>SHIPS</strong>, <strong>RESOURCES</strong>, or <strong>CELESTIAL</strong> tabs to start managing the blockchain.
          </p>
        </div>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 16px; color: var(--accent-teal);">
          DEPLOYMENT INFO
        </h2>

        <div style="color: var(--text-secondary); line-height: 1.8;">
          <div style="margin-bottom: 8px;">
            <strong>Network:</strong> Hardhat Local (localhost:8545)
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Chain ID:</strong> 1337
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Admin Wallet:</strong> <span class="mono">0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266</span>
          </div>
          <div>
            <strong>Celestial Bodies:</strong> TITAN, EUROPA, MARS, VENUS (deployed and configured)
          </div>
        </div>
      </div>
    </div>
  `;
}

# Goldgard Frontend

## How To Use The Frontend

### Landing Page

Route: `/`

- Start here if you want the product overview first.
- Use `Run the Demo Console` to try the contract flow.
- Use `Enter the Shieldwall` or `Launch Dashboard` to monitor the live app.
- Use `How To Use Goldgard` for the in-app quick guide.

### Demo Console

Route: `/demo`

Use this page to run the demo swap flow.

1. Connect your wallet.
2. Make sure your wallet is on the chain shown by the app.
3. Pick a trade direction.
4. Enter an amount.
5. Click `Mint Tokens`.
6. Wait for the mint transaction to confirm.
7. Click `Approve Router`.
8. Wait for the approval transaction to confirm.
9. Click `Execute`.

Important:

- If you switch trade direction after approval, approve again for the new token.
- If the page says `Wrong network selected`, switch your wallet network.
- If the page says `Demo config not configured`, that chain does not have a frontend deployment config yet.

### Dashboard

Route: `/dashboard`

Use this page to monitor the protocol.

- `SafetyModule Assets` shows the live reserve balance.
- `GGARD Balance` shows the connected wallet reward balance.
- `Reactive Sentinel` shows whether the early-warning system is active.
- `Reserve History` shows the rolling reserve chart.
- `RPC ok`, `WS ok`, and `Events ok` show frontend data-feed health.

### Insurance Scenario Builder

Location: opened from the dashboard modal

- Open the modal from the `Insurance Simulator` card.
- Adjust the scenario values.
- Run the scenario.
- Review premium, payout, coverage, and reactive metrics.
- Expand the markdown block if you want report-ready output.

### Quick Route Guide

- `/` for the overview
- `/demo` for swap simulation
- `/dashboard` for monitoring and insurance scenarios

/**
 * Minimal ABIs for Jeju XLPRouter and ERC20 (balanceOf, approve).
 * From design doc: swapExactETHForTokensV2, swapExactTokensForETHV2, swapExactTokensForTokensV2.
 */

export const ROUTER_ABI = [
  "function swapExactETHForTokensV2(uint256 amountOutMin, address[] path, address to, uint256 deadline) external payable returns (uint256[] amounts)",
  "function swapExactTokensForETHV2(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)",
  "function swapExactTokensForTokensV2(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) external returns (uint256[] amounts)",
] as const;

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

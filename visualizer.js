/**
 * visualizer.js — Visualizer window main entry point
 */
import { initVisualizer, loadLastScenario } from './js/visualizer-ui.js';

document.addEventListener('DOMContentLoaded', () => {
  initVisualizer();
  loadLastScenario();
});

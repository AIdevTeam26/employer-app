import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom does not implement scrollTo; App.jsx calls it when you click Edit.
window.scrollTo = vi.fn();

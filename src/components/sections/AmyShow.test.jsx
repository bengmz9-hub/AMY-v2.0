import { render, screen } from '@testing-library/react';
import AmyShow from './AmyShow';

// Mock IntersectionObserver
const mockIntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeAll(() => {
  window.IntersectionObserver = mockIntersectionObserver;
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe('AmyShow Component', () => {
  it('renders without crashing', () => {
    render(<AmyShow />);
    const section = screen.getByRole('region', { name: /clips de amy/i });
    expect(section).toBeInTheDocument();
  });

  it('renders the expected title and subtitle', () => {
    render(<AmyShow />);

    // Check for the "The Amy Show" title. Since it's rendered by WordReveal, we look for its text content.
    const theText = screen.getByText(/The/i);
    const amyShowText1 = screen.getByText(/Amy/i);
    const amyShowText2 = screen.getByText(/Show/i);
    expect(theText).toBeInTheDocument();
    expect(amyShowText1).toBeInTheDocument();
    expect(amyShowText2).toBeInTheDocument();

    // Check for subtitle
    const subtitle = screen.getByText('Jugadas, errores y momentos divertidos.');
    expect(subtitle).toBeInTheDocument();
  });

  it('renders the "Próximamente" message in the tiktok grid', () => {
    render(<AmyShow />);
    const proximamente = screen.getByText('Próximamente');
    expect(proximamente).toBeInTheDocument();
    expect(proximamente).toHaveClass('clip-title');
  });

  it('has the correct layout structure', () => {
    const { container } = render(<AmyShow />);

    // Check main section element
    const section = container.querySelector('#shorts');
    expect(section).toBeInTheDocument();
    expect(section).toHaveClass('shorts-section');
    expect(section).toHaveClass('fade-in-section');

    // Check title container
    const titleContainer = container.querySelector('.section-title');
    expect(titleContainer).toBeInTheDocument();

    // Check grid container
    const gridContainer = container.querySelector('.tiktok-grid');
    expect(gridContainer).toBeInTheDocument();

    // Check article wrapper
    const article = container.querySelector('.tiktok-wrapper');
    expect(article).toBeInTheDocument();
  });
});

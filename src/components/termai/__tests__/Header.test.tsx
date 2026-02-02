import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';
import '@testing-library/jest-dom';

// Mock the Firebase hooks from the barrel file
jest.mock('@/firebase', () => ({
  ...jest.requireActual('@/firebase'), // import and retain default behavior
  useUser: jest.fn(),
  useAuth: jest.fn(),
}));

// Mock the next/navigation hook
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
}));


// Mock child components
jest.mock('../VoiceControl', () => ({
  VoiceControl: () => <div data-testid="voice-control-mock"></div>,
}));

jest.mock('@/components/ui/sidebar', () => ({
    ...jest.requireActual('@/components/ui/sidebar'),
    SidebarTrigger: () => <button>Trigger</button>
}));


describe('Header', () => {
  // Directly import the mocked hooks
  const { useUser, useAuth } = require('@/firebase');

  beforeEach(() => {
    // Reset mocks before each test to ensure test isolation
    (useUser as jest.Mock).mockClear();
    (useAuth as jest.Mock).mockClear();
  });

  it('renders the header with the title "Molly"', () => {
    // Arrange: Mock the hooks to return a "logged out" state
    (useUser as jest.Mock).mockReturnValue({ user: null, loading: false });
    (useAuth as jest.Mock).mockReturnValue({});

    render(<Header onVoiceCommand={() => {}} />);

    // Act & Assert: Check for the title
    const titleElement = screen.getByText('Molly');
    expect(titleElement).toBeInTheDocument();
  });

  it('shows the user avatar when a user with a photoURL is logged in', () => {
     // Arrange: Mock a user with a photo
    const mockUser = {
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: 'https://example.com/avatar.png',
    };
    (useUser as jest.Mock).mockReturnValue({ user: mockUser, loading: false });
    (useAuth as jest.Mock).mockReturnValue({});

    render(<Header onVoiceCommand={() => {}} />);

    // Act & Assert: Check for the avatar image
    const avatarImage = screen.getByRole('img');
    expect(avatarImage).toHaveAttribute('src', mockUser.photoURL);
    expect(avatarImage).toHaveAttribute('alt', mockUser.displayName);
  });

   it('shows an avatar fallback when the user has no photoURL', () => {
     // Arrange: Mock a user without a photo
    const mockUser = {
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: null,
    };
    (useUser as jest.Mock).mockReturnValue({ user: mockUser, loading: false });
    (useAuth as jest.Mock).mockReturnValue({});

    render(<Header onVoiceCommand={() => {}} />);

    // Act & Assert: Check for the fallback initials "TU"
    const fallback = screen.getByText('TU');
    expect(fallback).toBeInTheDocument();
  });

  it('does not render user avatar when loading', () => {
    // Arrange: Mock the loading state
    (useUser as jest.Mock).mockReturnValue({ user: null, loading: true });
    (useAuth as jest.Mock).mockReturnValue({});

    render(<Header onVoiceCommand={() => {}} />);

    // Act & Assert: The avatar dropdown should not be present
    const avatarImage = screen.queryByRole('img');
    expect(avatarImage).not.toBeInTheDocument();
  });
});

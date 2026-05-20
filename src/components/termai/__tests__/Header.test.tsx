import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';
import { VoiceSettingsProvider } from '@/contexts/voice-settings';
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

jest.mock('../OriginStoryDialog', () => ({
  OriginStoryDialog: () => <div data-testid="origin-story-dialog-mock" />,
}));

jest.mock('../KillSwitch', () => ({
  KillSwitch: () => <div data-testid="kill-switch-mock" />,
}));

jest.mock('../VoiceSelector', () => ({
  VoiceSelector: () => <div data-testid="voice-selector-mock" />,
}));

jest.mock('../SystemHealthDot', () => ({
  SystemHealthDot: () => <div data-testid="system-health-dot-mock" />,
}));

jest.mock('@/components/ui/sidebar', () => ({
  ...jest.requireActual('@/components/ui/sidebar'),
  SidebarTrigger: () => <button>Trigger</button>,
}));

describe('Header', () => {
  // Directly import the mocked hooks
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser, useAuth } = require('@/firebase');
  const lastResponseRef = { current: null } as React.MutableRefObject<
    string | null
  >;
  const hardwareState = {
    temperature: 0,
    batteryLevel: 0,
    cpuUsage: 0,
  };

  beforeEach(() => {
    // Reset mocks before each test to ensure test isolation
    (useUser as jest.Mock).mockClear();
    (useAuth as jest.Mock).mockClear();
  });

  const renderHeader = () =>
    render(
      <VoiceSettingsProvider>
        <Header
          onVoiceCommand={() => {}}
          onAdminUnlock={() => {}}
          lastResponseRef={lastResponseRef}
          hardwareState={hardwareState}
        />
      </VoiceSettingsProvider>
    );

  it('renders the header with the title "Molly"', () => {
    // Arrange: Mock the hooks to return a "logged out" state
    (useUser as jest.Mock).mockReturnValue({
      user: null,
      isUserLoading: false,
      userError: null,
    });
    (useAuth as jest.Mock).mockReturnValue({});

    renderHeader();

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
    (useUser as jest.Mock).mockReturnValue({
      user: mockUser,
      isUserLoading: false,
      userError: null,
    });
    (useAuth as jest.Mock).mockReturnValue({});

    renderHeader();

    // Act & Assert: Check that the avatar/dropdown menu is rendered
    // In test environments, images may not load so we verify the component structure
    const avatarButton = screen
      .getAllByRole('button')
      .find((button) => button.className.includes('rounded-full'));
    expect(avatarButton).toBeInTheDocument();

    // Verify the fallback with user initials is shown (since images don't load in tests)
    const fallbackInitials = screen.getByText('TU');
    expect(fallbackInitials).toBeInTheDocument();
  });

  it('shows an avatar fallback when the user has no photoURL', () => {
    // Arrange: Mock a user without a photo
    const mockUser = {
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: null,
    };
    (useUser as jest.Mock).mockReturnValue({
      user: mockUser,
      isUserLoading: false,
      userError: null,
    });
    (useAuth as jest.Mock).mockReturnValue({});

    renderHeader();

    // Act & Assert: Check for the fallback initials "TU"
    const fallback = screen.getByText('TU');
    expect(fallback).toBeInTheDocument();
  });

  it('does not render user avatar when loading', () => {
    // Arrange: Mock the loading state
    (useUser as jest.Mock).mockReturnValue({
      user: null,
      isUserLoading: true,
      userError: null,
    });
    (useAuth as jest.Mock).mockReturnValue({});

    renderHeader();

    // Act & Assert: The avatar dropdown should not be present
    const avatarImage = screen.queryByRole('img');
    expect(avatarImage).not.toBeInTheDocument();
  });
});

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Footer, FooterNavItem } from './footer';

const meta: Meta<typeof Footer> = {
    title: 'Bootstrap / Footer',
    component: Footer,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    argTypes: {},
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children: (
            <>
                <FooterNavItem href="#" icon="bi-house">
                    Home
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-search">
                    Search
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-person">
                    Profile
                </FooterNavItem>
            </>
        ),
    },
};

export const WithActiveItem: Story = {
    args: {
        children: (
            <>
                <FooterNavItem href="#" icon="bi-house" active>
                    Home
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-search">
                    Search
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-gear">
                    Settings
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-person">
                    Profile
                </FooterNavItem>
            </>
        ),
    },
};

export const ManyItems: Story = {
    args: {
        children: (
            <>
                <FooterNavItem href="#" icon="bi-house">
                    Home
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-search">
                    Search
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-bell">
                    Notifications
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-chat">
                    Messages
                </FooterNavItem>
                <FooterNavItem href="#" icon="bi-person">
                    Profile
                </FooterNavItem>
            </>
        ),
    },
};

// FooterNavItem stories - rendered within Footer for proper context
export const NavItemDefault: StoryObj<typeof FooterNavItem> = {
    args: {
        href: '#',
        icon: 'bi-house',
        children: 'Home',
    },
    render: (args) => (
        <Footer>
            <FooterNavItem {...args} />
        </Footer>
    ),
};

export const NavItemActive: StoryObj<typeof FooterNavItem> = {
    args: {
        href: '#',
        icon: 'bi-house',
        children: 'Home',
        active: true,
    },
    render: (args) => (
        <Footer>
            <FooterNavItem {...args} />
        </Footer>
    ),
};

export const NavItemIconOnly: StoryObj<typeof FooterNavItem> = {
    args: {
        href: '#',
        icon: 'bi-bell',
    },
    render: (args) => (
        <Footer>
            <FooterNavItem {...args} />
        </Footer>
    ),
};

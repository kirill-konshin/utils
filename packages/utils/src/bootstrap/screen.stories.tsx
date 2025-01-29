import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { Screen } from './screen';
import { Loading } from './loading';
import { Dropdown, DropdownButton, Form, Nav, Navbar } from 'react-bootstrap';
import { Footer, FooterNavItem } from './footer';
import { AdaptiveContainer } from './adaptiveContainer';

const lorem = (
    <>
        <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex
            ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
            nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
            anim id est laborum.
        </p>
        <h2>Section 1.10.32 of &quot;de Finibus Bonorum et Malorum&quot;, written by Cicero in 45 BC</h2>
        <p>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem
            aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni
            dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor
            sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore
            magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis
            suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in
            ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas
            nulla pariatur?
        </p>
        <h2>1914 translation by H. Rackham</h2>
        <p>
            But I must explain to you how all this mistaken idea of denouncing pleasure and praising pain was born and I
            will give you a complete account of the system, and expound the actual teachings of the great explorer of
            the truth, the master-builder of human happiness. No one rejects, dislikes, or avoids pleasure itself,
            because it is pleasure, but because those who do not know how to pursue pleasure rationally encounter
            consequences that are extremely painful. Nor again is there anyone who loves or pursues or desires to obtain
            pain of itself, because it is pain, but because occasionally circumstances occur in which toil and pain can
            procure him some great pleasure. To take a trivial example, which of us ever undertakes laborious physical
            exercise, except to obtain some advantage from it? But who has any right to find fault with a man who
            chooses to enjoy a pleasure that has no annoying consequences, or one who avoids a pain that produces no
            resultant pleasure?
        </p>
    </>
);

const meta = {
    title: 'Bootstrap / Screen',
    component: Screen,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        title: { control: 'text' },
        footer: { control: 'text' },
    },
    args: {
        children: lorem,
        title: 'Title',
        menu: (
            <Footer>
                <FooterNavItem href="/application/process" icon="bi-cup-hot-fill" active>
                    Coffee
                </FooterNavItem>
                <FooterNavItem href="/application/transcribe" icon="bi-pen-fill">
                    Assistant
                </FooterNavItem>
                <FooterNavItem href="/application/documents" icon="bi-star-fill">
                    Docs
                </FooterNavItem>
            </Footer>
        ),
        backCb: fn(),
    },
} satisfies Meta<typeof Screen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongContent: Story = {
    args: {
        header: <AdaptiveContainer>Header</AdaptiveContainer>,
        footer: <div>Footer</div>,
    },
};

export const Loader: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Centered content with hidden header and footer',
            },
        },
    },
    args: {
        children: <Loading />,
        centerContent: true,
        noHeader: true,
        noFooter: true,
    },
};

export const Centered: Story = {
    args: {
        children: 'Nothing to see here',
        centerContent: true,
    },
};

export const ForwardCb: Story = {
    args: {
        forwardCb: fn(),
    },
};

export const ForwardIcon: Story = {
    args: {
        forwardCb: fn(),
        forwardIcon: 'bi-trash',
    },
};

export const ForwardBtn: Story = {
    args: {
        forwardBtn: (
            <DropdownButton
                title={<span className="bi-three-dots" />}
                // size="sm"
                align="end"
                variant="nav"
                className={`dropdown-toggle-no-arrow`}
            >
                <Dropdown.Item>Preview</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item className="text-danger">Remove</Dropdown.Item>
            </DropdownButton>
        ),
    },
};

export const HeaderForm: Story = {
    args: {
        header: (
            <Navbar className="pt-0 py-lg-3">
                <AdaptiveContainer>
                    <div className="position-relative w-100">
                        <span className="bi-search position-absolute" style={{ right: '8px', top: '3px' }} />
                        <Form.Control placeholder="Search" size="sm" />
                    </div>
                </AdaptiveContainer>
            </Navbar>
        ),
    },
};

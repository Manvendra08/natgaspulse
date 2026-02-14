'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

type LogoVariant = 'icon' | 'text';

interface LogoProps {
    variant?: LogoVariant;
    className?: string;
    iconSize?: number;
    textWidth?: number;
    href?: string;
    withLink?: boolean;
    priority?: boolean;
}

export default function Logo({
    variant = 'text',
    className,
    iconSize = 40,
    textWidth = 240,
    href = '/dashboard',
    withLink = true,
    priority = false
}: LogoProps) {
    const src = variant === 'icon' ? '/images/logo.png' : '/images/logo-text.svg';
    const width = variant === 'icon' ? iconSize : textWidth;
    const height = variant === 'icon' ? iconSize : Math.round(textWidth * 0.233);

    const content = (
        <Image
            src={src}
            alt="NatGasPulse"
            width={width}
            height={height}
            priority={priority}
            className={cn('h-auto w-auto', className)}
        />
    );

    if (!withLink) return content;

    return (
        <Link href={href} className="inline-flex items-center" aria-label="NatGasPulse Home">
            {content}
        </Link>
    );
}


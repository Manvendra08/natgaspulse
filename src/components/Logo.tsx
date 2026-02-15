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
    const content = variant === 'icon'
        ? (
            <Image
                src="/images/logo.png"
                alt="NatGasPulse"
                width={iconSize}
                height={iconSize}
                priority={priority}
                className={cn('h-auto w-auto', className)}
            />
        )
        : (
            <div className={cn('inline-flex items-center gap-2', className)}>
                <Image
                    src="/images/logo.png"
                    alt="NatGasPulse"
                    width={iconSize}
                    height={iconSize}
                    priority={priority}
                    className="h-auto w-auto"
                />
                <span
                    className="hidden sm:inline text-primary font-bold tracking-tight leading-none"
                    style={{ fontSize: Math.max(16, Math.round(textWidth / 12)) }}
                >
                    NatGasPulse
                </span>
            </div>
        );

    if (!withLink) return content;

    return (
        <Link href={href} className="inline-flex items-center" aria-label="NatGasPulse Home">
            {content}
        </Link>
    );
}

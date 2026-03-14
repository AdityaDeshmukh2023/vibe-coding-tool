'use client';

import Link from 'next/link';

import { ClerkLoaded, ClerkLoading, SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/nextjs';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserControl } from '@/components/user-control';
import { LINKS } from '@/config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useScroll } from '@/hooks/use-scroll';
import { cn } from '@/lib/utils';

export const Navbar = () => {
	const isScrolled = useScroll();
	const isMobile = useIsMobile();

	return (
		<nav
			className={cn(
				'fixed inset-x-0 top-0 z-50 border-b border-transparent bg-transparent p-4 transition-all duration-200',
				isScrolled && 'bg-background border-border'
			)}
		>
			<div className='mx-auto flex w-full max-w-5xl items-center justify-between'>
				<Link href='/' className='flex items-center gap-2'>
					<img src='/logo.svg' alt='Vibe logo' width={24} height={24} />
					<span className='text-lg font-semibold'>Vibe</span>
				</Link>

				<ClerkLoading>
					<div className='flex items-center gap-2'>
						<Skeleton className='h-8 w-16' />
						<Skeleton className='h-8 w-16' />
					</div>
				</ClerkLoading>

				<ClerkLoaded>
					<div className='flex items-center gap-2'>
						<SignedOut>
							<div className='flex gap-2'>
								<div className='hidden sm:inline-block'>
									<SignUpButton>
										<Button variant='outline' size='sm'>
											Sign up
										</Button>
									</SignUpButton>
								</div>

								<SignInButton>
									<Button size='sm'>Sign in</Button>
								</SignInButton>
							</div>
						</SignedOut>

						<SignedIn>
							<UserControl showName={!isMobile} />
						</SignedIn>

						<ThemeToggle />

						<Link
							href={LINKS.SOURCE_CODE}
							target='_blank'
							rel='noopener noreferrer'
							className='hover:opacity-75 dark:invert'
						>
							<img src='/github.svg' alt='GitHub' height={32} width={32} />
							<span className='sr-only'>Source Code</span>
						</Link>
					</div>
				</ClerkLoaded>
			</div>
		</nav>
	);
};

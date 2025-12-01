<script lang="ts">
	import { cva, type VariantProps } from "class-variance-authority";
	import { cn } from "$lib/utils";

	const badgeVariants = cva(
		"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
		{
			variants: {
				variant: {
					default: "border-transparent bg-primary text-primary-foreground",
					secondary: "border-transparent bg-secondary text-secondary-foreground",
					destructive: "border-transparent bg-destructive text-destructive-foreground",
					outline: "text-foreground",
					success: "border-transparent bg-green-100 text-green-800",
					warning: "border-transparent bg-orange-100 text-orange-800",
				},
			},
			defaultVariants: {
				variant: "default",
			},
		}
	);

	type Variant = VariantProps<typeof badgeVariants>["variant"];

	export let variant: Variant = "default";
	let className: string = "";
	export { className as class };
</script>

<div class={cn(badgeVariants({ variant }), className)}>
	<slot />
</div>
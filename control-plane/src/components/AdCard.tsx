import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
} from "@/components/ui/card";

interface AdCardProps {
  icon: string;
  title: string;
  label: string;
  imageSrc: string;
  imageAlt: string;
  description: string;
  subtitle: string;
  buttonText: string;
  buttonHref: string;
}

export function AdCard({
  icon,
  title,
  label,
  imageSrc,
  imageAlt,
  description,
  subtitle,
  buttonText,
  buttonHref,
}: AdCardProps) {
  return (
    <Card className="w-full bg-card border-2 border-border flex flex-col">
      <CardHeader className="bg-secondary border-b border-border pb-4">
        {/* The label sits under the title, so side by side the three
            headers stay the same height however long the title is. */}
        <div className="flex flex-col items-start gap-2">
          <CardTitle className="text-foreground text-xl font-bold flex items-center gap-2">
            {icon} {title}
          </CardTitle>
          <span className="text-xs bg-muted text-muted-foreground border border-border px-2 py-1 rounded">
            {label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-4 p-6">
        <div className="flex-shrink-0">
          <div className="p-2 bg-card border border-border rounded">
            <Image
              src={imageSrc}
              alt={imageAlt}
              width={100}
              height={100}
              className="hover:opacity-90 transition-opacity"
            />
          </div>
        </div>
        <div className="text-center">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-muted-foreground break-keep">
              {description}
            </p>
            <p className="text-sm text-muted-foreground break-keep">{subtitle}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-6 pt-0">
        <Button
          asChild
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border border-primary font-medium"
        >
          <Link href={buttonHref} target="_blank">
            {buttonText}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

CREATE TABLE "tender_invitations" (
	"tender_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tender_invitations_tender_supplier_uq" ON "tender_invitations" USING btree ("tender_id","supplier_id");--> statement-breakpoint
CREATE INDEX "tender_invitations_supplier_idx" ON "tender_invitations" USING btree ("supplier_id","tender_id");
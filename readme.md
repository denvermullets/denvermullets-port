# denvermullets photography portfolio

i previously was using format.com for 6yrs and after getting tired of the rising
costs and features i didn't need, i decided to just build it in html/css and host
it on aws for free.

## pulumi

in classic dev fashion, i over complicated it a little by digging in to pulumi w/ai help.

## deploy

`pulumi up`

###### see notes below

## remove

`pulumi destroy`

## notes

there's a few things to remember. pulumi doesn't have a way to connect with
namecheap (my domain registrar) so i can't just let pulumi create the
route53 / cert / dns stuff. that is a manual step but it's not hard to do.

as a pre-req i created a specific user for this project and made a specific
group w/the permissions needed. i did end up needing to create a custom policy
for the cloudfront stuff, but you could get by with one of the more general policies.

i opted to manually upload my photos to aws instead of checking them into
git ( i did at first ), so that's up to you.

## steps for new deployment (w/namecheap)

- create a user group on aws and give the appropriate roles (mostly s3 admin, cloudfront, and bucket perms if needed)
- run `pulumi up`
- create a CNAME record w/the host as `_645646caas4664646464.domain.com` or `resourceRecordName`, no period and no .www
  - the value is the `resourceRecordValue` value as is. it looks like `d908098s09098s089.cloudfront.net`
- check in ACM (certificate manager) on AWS and once the cert is `validated`, come back and uncomment CDN code and run `pulumi up`
- go back to namecheap and add the `distributionDomain` as a `ALIAS` record for the domain. if you are using www.domain.com then you can use another `CNAME` record.

## updates to site

just rerun `pulumi up`

// Column names the lead importer recognises (compared in lower case, ignoring spaces, dashes and underscores).
// Shared by the browser (to warn before importing) and the server (to read the rows).
export const EMAIL_COLUMNS = ["email", "emailid", "emailaddress", "contactemail", "useremail", "mail", "emails"];
export const COMPANY_COLUMNS = ["company", "companyname", "legalname", "businessname", "carriername", "carrier"];
export const STATE_COLUMNS = ["state", "phystate", "st"];
export const UNITS_COLUMNS = ["powerunits", "nbrpowerunit", "trucks", "numberoftrucks", "units", "fleetsize"];
export const DOT_COLUMNS = ["dot", "usdot", "dotnumber", "usdotnumber"];
export const PHONE_COLUMNS = ["phone", "phonenumber", "userphone", "telephone", "mobile", "mobilenumber", "cell", "cellphone", "contactphone", "phoneno"];

const norm = (k: string) => k.trim().toLowerCase().replace(/[\s_\-.]/g, "");
/** The first column whose name matches, or undefined. */
export const findColumn = (headers: string[], names: string[]) => headers.find((h) => names.includes(norm(h)));

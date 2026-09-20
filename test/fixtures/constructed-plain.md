# Intake form fix

We fixed the intake form on Tuesday. It had been dropping about a third of
submissions since the March deploy, which nobody noticed because the error was
swallowed by a catch block that logged nothing.

The fix took two hours. The form now logs failures to the same place as
everything else, and a failed submission shows the person a message with a
phone number on it.

We checked the last ninety days of server logs and found 212 dropped
submissions. Forty of them had left an email address in an earlier field, so
we wrote to those people by hand.

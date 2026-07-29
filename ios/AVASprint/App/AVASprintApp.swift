#if os(iOS)
import SwiftUI
import AVASprintCore

@main struct AVASprintApp:App{
    var body:some Scene{WindowGroup{RootView()}}
}
struct RootView:View{
    var body:some View{BetaExperienceView(package:nil)}
}
struct Placeholder:View{let title:String,icon:String
    var body:some View{NavigationStack{ZStack{AVAColor.background.ignoresSafeArea()
      VStack(spacing:AVASpacing.lg){Image(systemName:icon).font(.system(size:40)).foregroundStyle(AVAColor.brand)
        Text(title).font(AVATypography.title);Text("Native foundation").foregroundStyle(AVAColor.secondary)}
    }.navigationTitle(title)}}}
enum AVAColor{static let background=Color(red:.035,green:.035,blue:.045)
    static let surface=Color(red:.09,green:.09,blue:.11);static let brand=Color(red:.84,green:.15,blue:.22)
    static let secondary=Color(red:.63,green:.64,blue:.67)}
enum AVASpacing{static let xs:CGFloat=4,sm:CGFloat=8,md:CGFloat=16,lg:CGFloat=24,xl:CGFloat=32}
enum AVATypography{static let title=Font.system(.title,design:.rounded,weight:.semibold)}
#endif
